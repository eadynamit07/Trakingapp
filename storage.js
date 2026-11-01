// IndexedDB is the source of truth. All mutations commit before reporting success.
const Storage = {
  db: null,
  state: null,
  queue: Promise.resolve(),
  backupQueue: Promise.resolve(),
  backupHandle: null,
  backupStatus: 'Kein Dateibackup eingerichtet.',
  persistenceStatus: 'Dauerhafter Speicher wird angefragt …',
  defaults() {
    return { entries: [], favorites: [], drafts: {}, settings: {
      apiKey: '', goals: { calories: null, protein: null, carbs: null, fat: null }
    }};
  },
  async init() {
    if (this.db) return;
    this.requestPersistence();
    this.db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('kcal-tracker', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('data');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => this.report('Bitte andere KCal-Tabs schließen, um den Speicher zu öffnen.');
    });
    this.db.onversionchange = () => { this.db.close(); this.report('App bitte neu laden: Der Datenspeicher wurde aktualisiert.'); };
    let migrated = false;
    await this.commit(state => {
      if (state) return state;
      const next = this.defaults();
      // Preserve legacy data until the IndexedDB transaction has completed.
      const entries = localStorage.getItem('kcaltracker_entries');
      const settings = localStorage.getItem('kcaltracker_settings');
      if (entries) next.entries = this.validateEntries(JSON.parse(entries), true);
      if (settings) next.settings = this.validateSettings(JSON.parse(settings));
      migrated = true;
      return next;
    }, false);
    if (migrated) {
      localStorage.removeItem('kcaltracker_entries');
      localStorage.removeItem('kcaltracker_settings');
    }
    this.backupHandle = await this.read('backupHandle');
    if (this.backupHandle) this.scheduleBackup();
    if (typeof BroadcastChannel !== 'undefined') {
      this.channel = new BroadcastChannel('kcal-tracker');
      this.channel.onmessage = async event => {
        this.state = await this.read('state');
        this.backupHandle = await this.read('backupHandle');
        if (event.data !== 'draft') window.dispatchEvent(new Event('kcal-storage-change'));
        this.statusChanged();
      };
    }
  },
  async requestPersistence() {
    try {
      const granted = !!(navigator.storage?.persist && await navigator.storage.persist());
      this.persistenceStatus = granted ? 'Dauerhafter Browserspeicher ist aktiv.' :
        'Daten werden automatisch gespeichert. Der Browser hat dauerhaften Speicher nicht zugesichert.';
    } catch { this.persistenceStatus = 'Daten werden automatisch gespeichert; dauerhafter Speicher ist nicht verfügbar.'; }
    this.statusChanged();
  },
  statusChanged() { window.dispatchEvent(new Event('kcal-backup-status')); },
  report(message) { window.dispatchEvent(new CustomEvent('kcal-storage-error', { detail: message })); },
  read(key) {
    return new Promise((resolve, reject) => {
      const request = this.db.transaction('data').objectStore('data').get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  },
  commit(update, notify = true) {
    const work = this.queue.then(() => new Promise((resolve, reject) => {
      const tx = this.db.transaction('data', 'readwrite');
      const store = tx.objectStore('data');
      const request = store.get('state');
      let next, failure;
      request.onsuccess = () => {
        try { next = update(request.result); store.put(next, 'state'); }
        catch (error) { failure = error; tx.abort(); }
      };
      tx.oncomplete = () => {
        this.state = next;
        if (notify) {
          this.channel?.postMessage(notify === 'draft' ? 'draft' : 'change');
          if (notify !== 'draft') window.dispatchEvent(new Event('kcal-storage-change'));
          this.scheduleBackup();
        }
        resolve();
      };
      tx.onabort = tx.onerror = () => reject(failure || tx.error || new Error('Speicherfehler'));
    }));
    // Keep subsequent writes working after a failure, while callers still receive it.
    this.queue = work.catch(error => this.report(`Nicht gespeichert: ${error.message}. Bitte erneut versuchen oder Daten exportieren.`));
    return work;
  },
  getSettings() { return structuredClone(this.state.settings); },
  getApiKey() { return this.state.settings.apiKey; },
  getGoals() { return this.getSettings().goals; },
  saveSettings(settings) {
    const valid = this.validateSettings(settings);
    return this.commit(state => ({ ...state, settings: valid }));
  },
  getAllEntries() { return structuredClone(this.state.entries); },
  getEntriesByDate(date) { return structuredClone(this.state.entries.filter(entry => entry.date === date)); },
  getEntryById(id) { return structuredClone(this.state.entries.find(entry => entry.id === id) || null); },
  getDatesWithEntries() { return [...new Set(this.state.entries.map(entry => entry.date))]; },
  async addEntry(entry, draftPrefix) {
    const item = this.validateEntries([{ ...entry, id: this.id(), timestamp: new Date().toISOString() }])[0];
    await this.commit(state => {
      state.entries.push(item);
      if (draftPrefix) {
        for (const key of Object.keys(state.drafts)) {
          if (key.startsWith(draftPrefix + '-')) delete state.drafts[key];
        }
      }
      return state;
    });
    return item;
  },
  deleteEntry(id) { return this.commit(state => ({ ...state, entries: state.entries.filter(entry => entry.id !== id) })); },
  clearAllEntries() { return this.commit(state => ({ ...state, entries: [] })); },
  clearAll() { return this.commit(() => this.defaults()); },
  saveDraft(id, value) {
    return this.commit(state => { state.drafts[id] = String(value); return state; }, 'draft');
  },
  getFavorites() { return structuredClone(this.state.favorites); },
  favoriteKey(entry) { return JSON.stringify([entry.name, entry.category, entry.calories, entry.protein, entry.carbs, entry.fat]); },
  isFavorite(entry) { return this.state.favorites.some(item => this.favoriteKey(item) === this.favoriteKey(entry)); },
  toggleFavorite(entry) {
    return this.commit(state => {
      const key = this.favoriteKey(entry);
      const found = state.favorites.find(item => this.favoriteKey(item) === key);
      if (found) state.favorites = state.favorites.filter(item => item.id !== found.id);
      else state.favorites.push({ ...entry, id: this.id() });
      return state;
    });
  },
  getDayTotals(date) {
    return this.state.entries.filter(entry => entry.date === date).reduce((totals, entry) => {
      for (const key of ['calories', 'protein', 'carbs', 'fat']) totals[key] += entry[key];
      return totals;
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  },
  id() { return crypto.randomUUID(); },
  validDate(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(new Date(value + 'T00:00:00Z').getTime()) && new Date(value + 'T00:00:00Z').toISOString().slice(0, 10) === value;
  },
  validateEntries(entries, legacy = false) {
    if (!Array.isArray(entries) || entries.length > 100000) throw new Error('Ungültige Eintragsliste.');
    const ids = new Set();
    return entries.map(entry => {
      if (!entry || typeof entry !== 'object' || !this.validDate(entry.date) ||
        typeof entry.name !== 'string' || !entry.name.trim() || entry.name.length > 1000) throw new Error('Ungültiger Name oder Datum in einem Eintrag.');
      const id = legacy && !entry.id ? this.id() : entry.id;
      if (typeof id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(id) || ids.has(id)) throw new Error('Ungültige oder doppelte Eintrags-ID.');
      ids.add(id);
      const item = { id, name: entry.name.trim(), date: entry.date,
        category: entry.category ?? 'snack', source: typeof entry.source === 'string' ? entry.source.slice(0, 50) : 'import' };
      if (!['breakfast', 'lunch', 'dinner', 'snack'].includes(item.category)) throw new Error('Ungültige Mahlzeit-Kategorie.');
      for (const key of ['calories', 'protein', 'carbs', 'fat']) {
        const value = legacy ? Number(entry[key] ?? 0) : entry[key];
        if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000) throw new Error('Nährwerte müssen endliche, nicht negative Zahlen sein.');
        item[key] = value;
      }
      if (entry.timestamp !== undefined) {
        if (typeof entry.timestamp !== 'string' || !Number.isFinite(Date.parse(entry.timestamp))) throw new Error('Ungültiger Zeitstempel.');
        item.timestamp = entry.timestamp;
      }
      if (typeof entry.amount === 'string') item.amount = entry.amount.slice(0, 100);
      return item;
    });
  },
  validateSettings(settings) {
    if (!settings || typeof settings !== 'object' || Array.isArray(settings) ||
      (settings.apiKey !== undefined && (typeof settings.apiKey !== 'string' || settings.apiKey.length > 1000)) ||
      !settings.goals || typeof settings.goals !== 'object' || Array.isArray(settings.goals)) throw new Error('Ungültige Einstellungen.');
    const goals = {};
    for (const key of ['calories', 'protein', 'carbs', 'fat']) {
      const value = settings.goals[key] ?? null;
      if (value !== null && (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 1000000)) throw new Error('Ungültiges Tagesziel.');
      goals[key] = value;
    }
    return { apiKey: settings.apiKey || '', goals };
  },
  exportData() {
    // API keys are deliberately not written to portable JSON files.
    return { app: 'kcal-tracker', schemaVersion: 1, exportedAt: new Date().toISOString(),
      entries: this.getAllEntries(), favorites: this.getFavorites(), drafts: structuredClone(this.state.drafts),
      settings: { goals: this.getGoals() } };
  },
  validateBackup(data) {
    if (!data || data.app !== 'kcal-tracker' || data.schemaVersion !== 1) throw new Error('Keine unterstützte KCal-Sicherungsdatei (Schema 1).');
    const drafts = {};
    if (!data.drafts || typeof data.drafts !== 'object' || Array.isArray(data.drafts)) throw new Error('Ungültige Entwürfe.');
    for (const [key, value] of Object.entries(data.drafts)) {
      if (!/^(manual-|photo-|text-|barcode-|add-target-date)/.test(key) || typeof value !== 'string' || value.length > 10000 || ['__proto__', 'constructor', 'prototype'].includes(key)) throw new Error('Ungültiger Entwurf.');
      drafts[key] = value;
    }
    return { entries: this.validateEntries(data.entries), favorites: this.validateEntries(data.favorites),
      settings: this.validateSettings(data.settings), drafts };
  },
  async importData(data, mode) {
    const valid = this.validateBackup(data);
    if (!['merge', 'replace'].includes(mode)) throw new Error('Ungültiger Importmodus.');
    await this.commit(state => {
      if (mode === 'replace') return { ...valid, settings: { ...valid.settings, apiKey: state.settings.apiKey } };
      // Existing IDs win; importing the same file twice does not duplicate meals.
      const ids = new Set(state.entries.map(entry => entry.id));
      state.entries.push(...valid.entries.filter(entry => !ids.has(entry.id)));
      const favorites = new Set(state.favorites.map(entry => this.favoriteKey(entry)));
      for (const entry of valid.favorites) if (!favorites.has(this.favoriteKey(entry))) {
        state.favorites.push({ ...entry, id: this.id() }); favorites.add(this.favoriteKey(entry));
      }
      return state;
    });
  },
  async setBackupHandle(handle) {
    await new Promise((resolve, reject) => {
      const tx = this.db.transaction('data', 'readwrite');
      if (handle) tx.objectStore('data').put(handle, 'backupHandle');
      else tx.objectStore('data').delete('backupHandle');
      tx.oncomplete = resolve;
      tx.onabort = tx.onerror = () => reject(tx.error);
    });
    this.backupHandle = handle;
    this.channel?.postMessage('change');
    if (handle) await this.scheduleBackup();
    else { this.backupStatus = 'Dateibackup deaktiviert. Die bisherige Datei bleibt erhalten.'; this.statusChanged(); }
  },
  scheduleBackup() {
    if (!this.backupHandle) return Promise.resolve();
    this.backupQueue = this.backupQueue.catch(() => {}).then(async () => {
      const handle = this.backupHandle;
      if (!handle) return;
      try {
        if (await handle.queryPermission({ mode: 'readwrite' }) !== 'granted') {
          this.backupStatus = 'Dateibackup pausiert – bitte Schreibzugriff erneut freigeben.';
          return;
        }
        // A browser lock also serializes file writes from multiple open tabs.
        const write = async () => {
          const state = await this.read('state');
          const payload = { ...this.exportData(), entries: state.entries, favorites: state.favorites,
            drafts: state.drafts, settings: { goals: state.settings.goals } };
          const writable = await handle.createWritable();
          try { await writable.write(JSON.stringify(payload, null, 2)); await writable.close(); }
          catch (error) { await writable.abort().catch(() => {}); throw error; }
          this.backupStatus = `Dateibackup „${handle.name}“ aktualisiert: ${new Date().toLocaleTimeString('de-DE')}`;
        };
        if (navigator.locks) await navigator.locks.request('kcal-file-backup', write);
        else await write();
      } catch { this.backupStatus = 'Dateibackup fehlgeschlagen. Datei und Schreibzugriff prüfen; die Daten sind in IndexedDB gespeichert.'; }
      finally { this.statusChanged(); }
    });
    return this.backupQueue;
  },
  formatDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  getToday() { return this.formatDate(new Date()); },
  getDisplayDate(value) {
    const today = new Date();
    for (const [offset, label] of [[0, 'Heute'], [-1, 'Gestern'], [1, 'Morgen']]) {
      const date = new Date(today); date.setDate(date.getDate() + offset);
      if (this.formatDate(date) === value) return label;
    }
    return value.split('-').reverse().join('.');
  },
  getWeekday(value) { return new Date(value + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long' }); },
  getFormattedFullDate(value) { return new Date(value + 'T00:00:00').toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }); },
  getMonthName(month) { return new Date(2026, month, 1).toLocaleDateString('de-DE', { month: 'long' }); }
};
