// ============================================
// KCal Tracker - AI Photo Module
// Camera capture + Gemini Vision API analysis
// ============================================

const AIPhoto = {
  stream: null,
  videoElement: null,
  canvasElement: null,

  modelCache: null,

  // Initialize camera
  async startCamera(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;

    this.stopCamera();
    try {
      // Prefer back camera for food photos
      this.stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 960 }
        }
      });
      this.videoElement.srcObject = this.stream;
      await this.videoElement.play();
      return { success: true };
    } catch (err) {
      this.stopCamera();
      return {
        success: false,
        error: 'Kamera-Zugriff fehlgeschlagen. Bitte erlaube den Kamera-Zugriff in den Browser-Einstellungen.'
      };
    }
  },

  // Stop camera stream
  stopCamera() {
    if (this.stream) {
      this.stream.getTracks().forEach(track => track.stop());
      this.stream = null;
    }
    if (this.videoElement) {
      this.videoElement.srcObject = null;
    }
  },

  // Capture photo from video stream
  capturePhoto() {
    if (!this.videoElement || !this.canvasElement || !this.videoElement.videoWidth || !this.videoElement.videoHeight) {
      return null;
    }

    const video = this.videoElement;
    const canvas = this.canvasElement;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0);

    // Get base64 image data (JPEG for smaller size)
    const dataUrl = canvas.toDataURL('image/jpeg', 0.8);
    const base64Data = dataUrl.split(',')[1];

    return {
      dataUrl,
      base64: base64Data,
      mimeType: 'image/jpeg'
    };
  },

  // Analyze photo with Gemini Vision API
  async analyzePhoto(base64Data, mimeType) {
    const apiKey = Storage.getApiKey();
    if (!apiKey) {
      return {
        success: false,
        error: 'Kein API Key hinterlegt. Bitte gehe zu den Einstellungen und gib deinen Gemini API Key ein.'
      };
    }

    const prompt = `Analysiere dieses Foto einer Mahlzeit oder eines Lebensmittels. 
Schätze die Nährwerte so genau wie möglich.

Antworte AUSSCHLIESSLICH mit einem JSON-Objekt in exakt diesem Format (ohne Markdown, ohne Codeblöcke, nur das JSON):
{"name": "Name der Mahlzeit/des Lebensmittels", "calories": Zahl, "protein": Zahl, "carbs": Zahl, "fat": Zahl}

- "calories" in kcal (ganzzahlig)
- "protein", "carbs", "fat" in Gramm (ganzzahlig)
- Wenn du mehrere Lebensmittel erkennst, kombiniere alle Werte zu einer Gesamtsumme.
- Schätze realistische Portionsgrößen basierend auf dem Bild.
- Wenn du kein Essen erkennst, antworte: {"name": "Nicht erkannt", "calories": 0, "protein": 0, "carbs": 0, "fat": 0}`;

    try {
      let models = await this.getModels(apiKey);
      for (let attempt = 0; attempt < Math.min(models.length, 3); attempt++) {
        const model = models[attempt];
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/${model}:generateContent`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            signal: AbortSignal.timeout(60000),
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }, { inline_data: { mime_type: mimeType, data: base64Data } }] }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 4096, responseMimeType: 'application/json' }
            })
          });
        if (response.status === 404) {
          this.modelCache = null;
          continue;
        }
        if (!response.ok) return { success: false, error: this.apiError(response.status) };
        const data = await response.json();
        const text = (data.candidates?.[0]?.content?.parts || [])
          .filter(part => !part.thought && typeof part.text === 'string')
          .map(part => part.text).join('').trim();
        if (!text) return { success: false, error: 'Keine auswertbare Antwort. Bitte versuche ein anderes Foto.' };
        let result;
        try { result = JSON.parse(text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')); }
        catch { return { success: false, error: 'Die Nährwerte konnten nicht gelesen werden. Bitte erneut versuchen.' }; }
        if (!result || typeof result.name !== 'string' || !result.name.trim() ||
          !['calories', 'protein', 'carbs', 'fat'].every(key => typeof result[key] === 'number' && Number.isFinite(result[key]) && result[key] >= 0)) {
          return { success: false, error: 'Die KI hat keine gültigen Nährwerte geliefert. Bitte ein anderes Foto wählen.' };
        }
        if (result.name === 'Nicht erkannt') return { success: false, error: 'Kein Essen erkannt. Bitte fotografiere deine Mahlzeit näher.' };
        return { success: true, data: {
          name: result.name.trim(), calories: Math.round(result.calories),
          protein: Math.round(result.protein), carbs: Math.round(result.carbs), fat: Math.round(result.fat)
        }};
      }
      return { success: false, error: 'Zurzeit ist kein passendes KI-Modell erreichbar. Bitte später erneut versuchen.' };
    } catch (error) {
      return { success: false, error: error.userMessage ||
        (error.name === 'TimeoutError' ? 'Die Analyse dauert zu lange. Bitte erneut versuchen.' : 'Keine Verbindung zur Fotoanalyse. Prüfe deine Internetverbindung.') };
    }
  },

  apiError(status) {
    if (status === 400 || status === 401 || status === 403) return 'Fotoanalyse nicht möglich. Prüfe deinen Gemini API Key und seine Berechtigungen im Profil.';
    if (status === 429) return 'Dein KI-Limit ist erreicht. Bitte später erneut versuchen oder dein Kontingent prüfen.';
    if (status >= 500) return 'Der KI-Dienst ist gerade nicht erreichbar. Bitte später erneut versuchen.';
    return 'Die Fotoanalyse ist fehlgeschlagen. Bitte erneut versuchen.';
  },

  async getModels(apiKey) {
    if (this.modelCache?.key === apiKey) return this.modelCache.models;
    let pageToken = '';
    const models = [];
    do {
      const url = new URL('https://generativelanguage.googleapis.com/v1beta/models');
      url.searchParams.set('pageSize', '1000');
      if (pageToken) url.searchParams.set('pageToken', pageToken);
      const response = await fetch(url, { headers: { 'x-goog-api-key': apiKey }, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw { userMessage: this.apiError(response.status) };
      const data = await response.json();
      models.push(...(data.models || []).filter(model =>
        /^models\/gemini-[a-z0-9.-]+$/i.test(model.name) && /flash/.test(model.name) &&
        !/image|tts|audio|live|native|robotics/.test(model.name) &&
        model.supportedGenerationMethods?.includes('generateContent')));
      pageToken = data.nextPageToken || '';
    } while (pageToken);
    models.sort((a, b) => {
      const score = name => {
        const version = name.match(/gemini-(\d+(?:\.\d+)?)/);
        return (version ? Number(version[1]) : 0) * 100 +
          (/preview|exp/.test(name) ? -1000 : 0) + (/lite/.test(name) ? -1 : 0);
      };
      return score(b.name) - score(a.name);
    });
    if (!models.length) throw { userMessage: 'Für deinen API Key ist kein passendes Foto-Modell verfügbar.' };
    const names = [...new Set(models.map(model => model.name))];
    this.modelCache = { key: apiKey, models: names };
    return names;
  },

  async prepareFile(file) {
    if (!file.type.startsWith('image/')) throw new Error('Bitte wähle eine Bilddatei.');
    if (file.size > 25 * 1024 * 1024) throw new Error('Das Bild ist zu groß. Bitte wähle ein Bild unter 25 MB.');
    const bitmap = await createImageBitmap(file).catch(() => { throw new Error('Dieses Bildformat konnte nicht geöffnet werden. Bitte JPG, PNG oder WebP verwenden.'); });
    try {
      const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(bitmap.width * scale));
      canvas.height = Math.max(1, Math.round(bitmap.height * scale));
      const context = canvas.getContext('2d');
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return { dataUrl, base64: dataUrl.split(',')[1], mimeType: 'image/jpeg' };
    } finally { bitmap.close(); }
  }
};
