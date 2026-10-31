const {readFileSync, existsSync} = require('node:fs');
const {resolve} = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = resolve(__dirname, '..');
const read = name => readFileSync(resolve(root, name), 'utf8');
const response = (status, data) => ({ok: status >= 200 && status < 300, status, json: async () => data});
const model = name => ({name: `models/${name}`, supportedGenerationMethods:['generateContent']});
function photoContext(fetch, key = 'test-only') {
  const context = vm.createContext({Storage:{getApiKey:()=>key}, fetch, AbortSignal, URL, console});
  vm.runInContext(read('ai-photo.js')+'\nthis.photo = AIPhoto;',context);
  return context.photo;
}
(async () => {
  const noKey = await photoContext(() => {throw Error('Must not send');}, '').analyzePhoto('base64','image/jpeg');
  assert.equal(noKey.success, false);
  let calls = [];
  const photo = photoContext(async (url, options) => {
    calls.push(String(url));
    assert.equal(options.headers['x-goog-api-key'], 'test-only');
    assert(!String(url).includes('test-only'));
    if (calls.length === 1) return response(200,{models:[model('gemini-2.5-flash'), model('gemini-3.8-flash'),model('gemini-4-flash-preview'),model('gemini-5-flash-image')]});
    if (calls.length === 2) return response(404,{});
    return response(200,{candidates:[{content:{parts:[{thought:true,text:'private thought'},{text:JSON.stringify({name:'Reis',calories:320,protein:8,carbs:60,fat:5})}]}}]});
  });
  const result = await photo.analyzePhoto('base64','image/jpeg');
  assert.equal(result.success,true);
  assert.equal(result.data.calories,320);
  assert(calls[1].includes('gemini-3.8-flash:'));
  assert(calls[2].includes('gemini-2.5-flash:'));
  assert.equal(photo.modelCache,null,'404 must invalidate cached discovery');
  const limited = photoContext(async url => String(url).includes(':generateContent') ? response(429,{}) : response(200,{models:[model('gemini-3.8-flash')]}));
  assert.match((await limited.analyzePhoto('base64','image/jpeg')).error,/Limit/);
  const malformed = photoContext(async url => String(url).includes(':generateContent') ? response(200,{candidates:[{content:{parts:[{text:'{"name":"Test","calories":-10,"protein":0,"carbs":0,"fat":0}'}]}}]}) : response(200,{models:[model('gemini-3.8-flash')]}));
  assert.equal((await malformed.analyzePhoto('base64','image/jpeg')).success,false);
  let pages=0;
  const paged = photoContext(async url => {
    pages++;
    return pages===1 ? response(200,{models:[],nextPageToken:'next'}) : response(200,{models:[model('gemini-3.8-flash')]});
  });
  assert.equal((await paged.getModels('test-only')).length,1);
  assert.equal(pages,2);
  await paged.getModels('test-only');
  assert.equal(pages,2,'discovery reused for same key');
  await paged.getModels('different-key');
  assert.equal(pages,3,'key changes trigger fresh discovery');

  const okMeal = () => response(200,{candidates:[{content:{parts:[{text:JSON.stringify({name:'Kartoffeln',calories:400,protein:15,carbs:50,fat:12})}]}}]});
  let retryCount=0; const progress=[]; const payloads=[];
  const timeoutRetry = photoContext(async (url, options) => {
    if (!String(url).includes(':generateContent')) return response(200,{models:[model('gemini-3.8-flash'),model('gemini-2.5-flash')]});
    payloads.push(JSON.parse(options.body));
    if (++retryCount === 1) throw {name:'TimeoutError'};
    return okMeal();
  });
  const withDescription = await timeoutRetry.analyzePhoto('same-image','image/jpeg','300 g Kartoffeln, 1 EL Öl, eine von zwei Portionen',{onProgress:message=>progress.push(message)});
  assert.equal(withDescription.success,true);
  assert.equal(retryCount,2);
  assert.equal(progress.length,2);
  for (const body of payloads) {
    assert(body.contents[0].parts[0].text.includes('300 g Kartoffeln, 1 EL Öl, eine von zwei Portionen'));
    assert.equal(body.contents[0].parts[1].inline_data.data,'same-image');
  }
  assert.equal(payloads[0].generationConfig.thinkingConfig.thinkingLevel,'low');
  assert.equal(payloads[1].generationConfig.thinkingConfig.thinkingBudget,0);
  assert(timeoutRetry.modelCache.models[0].includes('2.5'),'responsive model reused');
  let attempts=0;
  const exhausted=photoContext(async url=> {
    if (!String(url).includes(':generateContent')) return response(200,{models:[model('gemini-3.8-flash')]});
    attempts++; throw {name:'TimeoutError'};
  });
  const failure=await exhausted.analyzePhoto('image','image/jpeg');
  assert.equal(failure.success,false); assert.match(failure.error,/Erneut analysieren/); assert.equal(attempts,2);
  let serviceAttempts=0;
  const service=photoContext(async url=> {
    if (!String(url).includes(':generateContent')) return response(200,{models:[model('gemini-3.8-flash')]});
    return ++serviceAttempts===1 ? response(503,{}) : okMeal();
  });
  assert.equal((await service.analyzePhoto('image','image/jpeg')).success,true);
  const controller=new AbortController(); let cancelledAttempts=0;
  const cancelled=photoContext(async url=> {
    if (!String(url).includes(':generateContent')) return response(200,{models:[model('gemini-3.8-flash')]});
    cancelledAttempts++; controller.abort(); throw controller.signal.reason;
  });
  const cancellation=await cancelled.analyzePhoto('image','image/jpeg','',{signal:controller.signal});
  assert.match(cancellation.error,/abgebrochen/); assert.equal(cancelledAttempts,1);
  // Exercise an actual deadline signal with a never-finishing request.
  const deadline=photoContext(async (url,options)=> {
    if (!String(url).includes(':generateContent')) return response(200,{models:[model('gemini-3.8-flash')]});
    return new Promise((resolve,reject)=>options.signal.addEventListener('abort',()=>reject(options.signal.reason),{once:true}));
  });
  deadline.analysisTimeoutMs=20;
  const keepAlive=setTimeout(()=>{},200);
  const expired=await deadline.analyzePhoto('image','image/jpeg');
  clearTimeout(keepAlive);
  assert.equal(expired.success,false); assert.match(expired.error,/langsam/);

  const memory = new Map();
  const storage = vm.createContext({localStorage:{getItem:k=>memory.get(k)||null,setItem:(k,v)=>memory.set(k,v)},console});
  vm.runInContext(read('storage.js')+'\nthis.storage = Storage;',storage);
  storage.storage.init();
  assert.equal(storage.storage.getApiKey(),'');
  memory.set('kcaltracker_entries',JSON.stringify([{name:'Existing meal',date:'2026-10-31',calories:100}]));
  storage.storage.init();
  assert.equal(storage.storage.getAllEntries().length,1);
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.start_url,'./'); assert.equal(manifest.scope,'./');
  manifest.icons.forEach(icon => assert(existsSync(resolve(root, icon.src))));
  const scope = 'https://example.test/Trakingapp/';
  const handlers={};
  const sw=vm.createContext({self:{registration:{scope},location:{origin:'https://example.test'},addEventListener:(name,fn)=>handlers[name]=fn},URL,Set,Response,caches:{}});
  vm.runInContext(read('sw.js')+'\nthis.shell = [...SHELL];',sw);
  assert(sw.shell.every(url=>url.startsWith(scope)));
  sw.shell.forEach(url => assert(existsSync(resolve(root,new URL(url).pathname.slice('/Trakingapp/'.length)||'index.html')),url));
  let intercepted=false;
  handlers.fetch({request:{method:'GET',url:'https://generativelanguage.googleapis.com/v1beta/models'},respondWith:()=>intercepted=true});
  assert.equal(intercepted,false);
  console.log('PASS: descriptions, image retention in retries, thinking settings, timeout/503 fallback, retry limits, cancellation, total deadline, discovery, data preservation and offline assets.');
})().catch(error=>{console.error(error);process.exitCode=1;});
