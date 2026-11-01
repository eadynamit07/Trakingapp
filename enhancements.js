// Automatic drafts, backup controls and dashboard insights.
const Enhancements = {
  pendingImport: null,
  async run(action) {
    try { return await action(); }
    catch (error) { App.showToast(error.message || 'Die Aktion konnte nicht abgeschlossen werden.', 'error'); }
  },
  init() {
    // Prevent duplicate taps while a meal transaction is committing.
    for (const name of ['saveManualEntry', 'saveFromResults', 'saveBarcodeEntry', 'confirmDeleteEntry']) {
      const original = App[name].bind(App);
      App[name] = async (...args) => {
        if (this.savingMeal) return;
        this.savingMeal = true;
        try { await this.run(() => original(...args)); }
        finally { this.savingMeal = false; }
      };
    }
    this.restoreDrafts();
    this.setupBackup();
    this.setupAutosave();
    document.addEventListener('click', event => {
      const favorite = event.target.closest('[data-favorite-entry]');
      if (favorite) this.run(async () => {
        const entry = Storage.getEntryById(favorite.dataset.favoriteEntry);
        if (entry) await Storage.toggleFavorite(entry);
      });
      const quick = event.target.closest('[data-quick-favorite]');
      if (quick) this.run(async () => {
        if (quick.disabled) return;
        quick.disabled = true;
        try {
          const entry = Storage.getFavorites().find(item => item.id === quick.dataset.quickFavorite);
          if (entry) {
            await Storage.addEntry({ ...entry, date: App.currentDate, source: 'favorite' });
            App.showToast('Favorit eingetragen.', 'success');
          }
        } finally { quick.disabled = false; }
      });
      const remove = event.target.closest('[data-remove-favorite]');
      if (remove) this.run(async () => {
        const entry = Storage.getFavorites().find(item => item.id === remove.dataset.removeFavorite);
        if (entry) await Storage.toggleFavorite(entry);
      });
    });
    window.addEventListener('kcal-storage-change', () => {
      App.renderDashboard();
      if (App.currentScreen === 'calendar') App.renderCalendar();
    });
    window.addEventListener('kcal-backup-status', () => this.renderBackupStatus());
    this.renderBackupStatus();
    // Native numeric controls reject invalid edits without replacing stored goals.
    document.querySelectorAll('.macro-input-grid input[type="number"]').forEach(input => { input.max = '1000000'; });
  },
  draftFields(prefix) {
    return [...document.querySelectorAll(`#screen-add input[id], #screen-add textarea[id]`)]
      .filter(input => input.type !== 'file' && (!prefix || input.id.startsWith(prefix + '-')));
  },
  captureDraft(prefix) {
    const patch = Object.fromEntries(this.draftFields(prefix).map(input => [input.id, input.value]));
    patch[`${prefix}-results-visible`] = 'true';
    return this.run(() => Storage.commit(state => { Object.assign(state.drafts, patch); return state; }, 'draft'));
  },
  discardResults(prefix) {
    return this.run(() => Storage.saveDraft(`${prefix}-results-visible`, 'false'));
  },
  setupAutosave() {
    document.getElementById('screen-add').addEventListener('input', event => {
      const input = event.target;
      if (!input.id || input.type === 'file') return;
      this.run(() => Storage.saveDraft(input.id, input.value));
      const prefix = input.id.startsWith('photo-result-') ? 'photo' : input.id.startsWith('text-result-') ? 'text' : null;
      if (prefix) this.checkPlausibility(prefix, Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map(key => {
        const value = document.getElementById(`${prefix}-result-${key}`).value;
        return [key, value === '' ? null : Number(value)];
      })));
    });
    document.addEventListener('click', event => {
      const category = event.target.closest('.cat-btn');
      if (category) this.run(() => Storage.saveDraft(category.closest('.category-selector').id, category.dataset.cat));
    });
    document.getElementById('btn-add-set-today').addEventListener('click', () => this.run(() => Storage.saveDraft('add-target-date', App.getTargetDate())));
    for (const input of document.querySelectorAll('#settings-api-key, [id^="settings-goal-"]')) {
      input.addEventListener('input', () => this.run(() => this.saveSettingsForm()));
    }
  },
  async saveSettingsForm() {
    const settings = { apiKey: document.getElementById('settings-api-key').value.trim(), goals: {} };
    for (const key of ['calories', 'protein', 'carbs', 'fat']) {
      const input = document.getElementById(`settings-goal-${key}`);
      if (input.validity.badInput || (input.value !== '' && (!Number.isFinite(Number(input.value)) || Number(input.value) < 0 || Number(input.value) > 1000000))) {
        document.getElementById('autosave-status').textContent = 'Ungültiges Ziel – bitte eine Zahl zwischen 0 und 1.000.000 eingeben.';
        return;
      }
      settings.goals[key] = input.value === '' ? null : Number(input.value);
    }
    document.getElementById('autosave-status').textContent = 'Wird gespeichert …';
    AIPhoto.modelCache = null;
    await Storage.saveSettings(settings);
    document.getElementById('autosave-status').textContent = 'Alle Änderungen gespeichert.';
  },
  restoreDrafts() {
    const drafts = Storage.state.drafts;
    for (const input of this.draftFields()) {
      if (Object.hasOwn(drafts, input.id)) input.value = drafts[input.id];
    }
    for (const selector of document.querySelectorAll('.category-selector')) {
      if (!drafts[selector.id]) continue;
      for (const button of selector.querySelectorAll('.cat-btn')) button.classList.toggle('active', button.dataset.cat === drafts[selector.id]);
    }
    if (Storage.validDate(drafts['add-target-date'])) {
      App.currentDate = drafts['add-target-date'];
      App.calendarSelectedDate = App.currentDate;
    }
    for (const prefix of ['photo', 'text']) {
      if (drafts[`${prefix}-results-visible`] === 'true') {
        document.getElementById(`${prefix}-results`).style.display = 'block';
        this.checkPlausibility(prefix, Object.fromEntries(['calories', 'protein', 'carbs', 'fat'].map(key => {
          const value = drafts[`${prefix}-result-${key}`];
          return [key, value === '' || value === undefined ? null : Number(value)];
        })));
      }
    }
  },
  clearDraftForms() {
    for (const input of this.draftFields()) input.value = input.id === 'add-target-date' ? App.currentDate : '';
    for (const prefix of ['photo', 'text', 'barcode']) document.getElementById(`${prefix}-results`).style.display = 'none';
    App.photoData = App.barcodeProductData = null;
    document.getElementById('photo-preview').classList.remove('active');
    document.getElementById('photo-preview-img').removeAttribute('src');
    App.updatePhotoControls();
  },
  setAnalyzing(prefix, busy) {
    document.getElementById(`${prefix}-loading`).setAttribute('aria-busy', String(busy));
    document.getElementById(`btn-${prefix}-save`).disabled = busy;
  },
  isImplausible(data) {
    const values = ['calories', 'protein', 'carbs', 'fat'].map(key => data[key]);
    if (values.some(value => typeof value !== 'number' || !Number.isFinite(value) || value < 0)) return true;
    const energy = data.protein * 4 + data.carbs * 4 + data.fat * 9;
    return (data.calories === 0 && energy > 0) || (data.calories > 0 && energy === 0) ||
      (energy > 40 && Math.abs(data.calories - energy) > Math.max(80, energy * 0.4)) ||
      data.calories > 10000 || values.slice(1).some(value => value > 1000) || values.every(value => value === 0);
  },
  checkPlausibility(prefix, data) {
    document.getElementById(`${prefix}-plausibility`).hidden = !this.isImplausible(data);
  },
  renderDashboard(totals) {
    const energy = [totals.protein * 4, totals.carbs * 4, totals.fat * 9];
    const sum = energy.reduce((total, value) => total + value, 0);
    let percentages = energy.map(value => sum ? Math.floor(value / sum * 100) : 0);
    // Largest remainder rounding keeps the displayed shares at exactly 100%.
    if (sum) {
      const order = energy.map((value, i) => ({ i, fraction: value / sum * 100 - percentages[i] })).sort((a, b) => b.fraction - a.fraction);
      const missing = 100 - percentages.reduce((a, b) => a + b, 0);
      for (let i = 0; i < missing; i++) percentages[order[i].i]++;
    }
    document.getElementById('macro-distribution').innerHTML = sum ?
      `<div class="macro-share-bar" aria-hidden="true">${percentages.map((value, i) => `<span class="share-${i}" style="width:${value}%"></span>`).join('')}</div><div class="macro-share-labels">${['Protein', 'Kohlenhydrate', 'Fett'].map((label, i) => `<span>${label} <strong>${percentages[i]} %</strong></span>`).join('')}</div>` : '<p class="settings-note">Noch keine Makronährstoffe für diesen Tag.</p>';
    const favorites = Storage.getFavorites();
    document.getElementById('favorites-list').innerHTML = favorites.length ? favorites.map(entry =>
      `<div class="favorite-row"><button type="button" class="favorite-add" data-quick-favorite="${entry.id}"><strong>${App.escapeHtml(entry.name)}</strong><span>${Math.round(entry.calories)} kcal · ${this.categoryLabel(entry.category)} · + Eintragen</span></button><button type="button" class="favorite-toggle selected" data-remove-favorite="${entry.id}" aria-label="${App.escapeHtml(entry.name)} aus Favoriten entfernen">★</button></div>`).join('') : '<p class="settings-note">Markiere eine Mahlzeit mit ☆ als Favorit.</p>';
  },
  categoryLabel(category) { return { breakfast: 'Frühstück', lunch: 'Mittagessen', dinner: 'Abendessen', snack: 'Snacks' }[category] || 'Snacks'; },
  renderWeekAnalysis(dateStr) {
    const monday = new Date(dateStr + 'T00:00:00');
    monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, i) => {
      const day = new Date(monday); day.setDate(day.getDate() + i);
      const date = Storage.formatDate(day);
      return { date, totals: Storage.getDayTotals(date), count: Storage.getEntriesByDate(date).length };
    });
    const tracked = days.filter(day => day.count);
    const total = tracked.reduce((sum, day) => sum + day.totals.calories, 0);
    const max = Math.max(1, ...days.map(day => day.totals.calories));
    document.getElementById('week-analysis').innerHTML =
      `<p class="settings-note">${Storage.getDisplayDate(days[0].date)} – ${Storage.getDisplayDate(days[6].date)}<br>${tracked.length} von 7 Tagen erfasst · ${Math.round(total)} kcal gesamt${tracked.length ? ` · Ø ${Math.round(total / tracked.length)} kcal pro erfasstem Tag` : ''}</p><div class="week-analysis-bars">${days.map((day, i) => `<button type="button" class="week-analysis-day ${day.date === dateStr ? 'selected' : ''}" data-week-date="${day.date}" aria-label="${Storage.getFormattedFullDate(day.date)}: ${day.count ? Math.round(day.totals.calories) + ' kcal' : 'nicht erfasst'}"><span class="week-analysis-value">${day.count ? Math.round(day.totals.calories) : '–'}</span><span class="week-analysis-track"><span style="height:${day.count ? Math.max(2, day.totals.calories / max * 100) : 0}%"></span></span><span>${['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'][i]}</span></button>`).join('')}</div><p class="settings-note">Leere Tage gelten als nicht erfasst und fließen nicht in den Durchschnitt ein.</p>`;
    document.querySelectorAll('[data-week-date]').forEach(button => button.addEventListener('click', () => App.selectCalendarDate(button.dataset.weekDate)));
  },
  setupBackup() {
    const bind = (id, action) => document.getElementById(id).addEventListener('click', () => this.run(action));
    bind('btn-backup-select', async () => {
      const handle = await window.showSaveFilePicker({ suggestedName: 'kcal-tracker-backup.json', types: [{ description: 'KCal JSON-Sicherung', accept: { 'application/json': ['.json'] } }] }).catch(error => {
        if (error.name !== 'AbortError') throw error;
      });
      if (handle) await Storage.setBackupHandle(handle);
    });
    bind('btn-backup-resume', async () => {
      if (!Storage.backupHandle) return;
      const permission = await Storage.backupHandle.requestPermission({ mode: 'readwrite' });
      if (permission !== 'granted') throw new Error('Schreibzugriff verweigert. Die Daten bleiben in IndexedDB gespeichert.');
      await Storage.scheduleBackup();
    });
    bind('btn-backup-disable', () => Storage.setBackupHandle(null));
    bind('btn-export-json', async () => {
      await Storage.queue;
      const url = URL.createObjectURL(new Blob([JSON.stringify(Storage.exportData(), null, 2)], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `kcal-tracker-${Storage.getToday()}.json`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    });
    bind('btn-import-json', () => document.getElementById('import-file').click());
    document.getElementById('import-file').addEventListener('change', event => this.run(async () => {
      const file = event.target.files[0]; event.target.value = '';
      if (!file) return;
      if (file.size > 25 * 1024 * 1024) throw new Error('Sicherungsdatei zu groß (maximal 25 MB).');
      let data;
      try { data = JSON.parse(await file.text()); } catch { throw new Error('Die Datei enthält kein gültiges JSON.'); }
      const valid = Storage.validateBackup(data);
      this.pendingImport = data;
      document.getElementById('import-preview').textContent = `${valid.entries.length} Einträge, ${valid.favorites.length} Favoriten und ${valid.wellness.measurements.length} Körpermessungen geprüft${valid.wellness.profile ? ' · Körperprofil enthalten' : ''}. Wähle, wie die Sicherung übernommen werden soll.`;
      document.getElementById('import-mode').value = 'merge';
      document.getElementById('import-dialog').showModal();
    }));
    bind('btn-import-cancel', () => { this.pendingImport = null; document.getElementById('import-dialog').close(); });
    bind('btn-import-apply', async () => {
      if (!this.pendingImport || this.importing) return;
      this.importing = true;
      try {
        const mode = document.getElementById('import-mode').value;
        await Storage.importData(this.pendingImport, mode);
        this.pendingImport = null;
        document.getElementById('import-dialog').close();
        if (mode === 'replace') { this.clearDraftForms(); this.restoreDrafts(); Wellness.resetUI(); Wellness.restoreDrafts(); }
        App.loadSettings(); App.renderDashboard();
        if (App.currentScreen === 'calendar') App.renderCalendar();
        App.showToast('Sicherung erfolgreich importiert.', 'success');
      } finally { this.importing = false; }
    });
  },
  renderBackupStatus() {
    document.getElementById('persistence-status').textContent = Storage.persistenceStatus;
    document.getElementById('backup-status').textContent = Storage.backupStatus;
    const supported = typeof window.showSaveFilePicker === 'function';
    document.getElementById('btn-backup-select').disabled = !supported;
    document.getElementById('btn-backup-resume').hidden = !Storage.backupHandle;
    document.getElementById('btn-backup-disable').hidden = !Storage.backupHandle;
    document.getElementById('backup-support').textContent = supported ? '' : 'Dieser Browser unterstützt kein automatisches Dateibackup. IndexedDB und JSON-Import/Export sind verfügbar.';
  }
};
