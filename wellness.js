const Wellness = {
  files: [], previewUrls: [], pendingRows: [], controller: null, coachController: null,
  chartMetric: 'weightKg', chartPeriod: 'all', suggestedGoal: null,
  esc(value) { return App.escapeHtml(String(value ?? '')); },
  format(value, unit = '') { return value == null ? '–' : `${Number(value).toLocaleString('de-DE', { maximumFractionDigits: 1 })}${unit ? ' ' + unit : ''}`; },
  async act(action, errorId = 'wellness-error') {
    const error = document.getElementById(errorId); if (error) error.hidden = true;
    try { return await action(); }
    catch (failure) {
      const message = failure.message || 'Die Aktion konnte nicht abgeschlossen werden.';
      if (error) { error.textContent = message; error.hidden = false; }
      else App.showToast(message, 'error');
    }
  },
  init() {
    this.buildUI();
    this.bind();
    this.restoreDrafts();
    this.render();
    window.addEventListener('kcal-storage-change', () => this.render());
    window.addEventListener('pagehide', () => { this.controller?.abort(); this.coachController?.abort(); });
    document.getElementById('import-dialog').addEventListener('close', () => { this.restoreDrafts(); this.render(); });
    if (Storage.state.wellness.onboarding === 'pending' && !Storage.state.wellness.profile) this.openProfile();
  },
  buildUI() {
    const options = Object.entries(WellnessModel.goals).map(([key, label]) => `<option value="${key}">${label}</option>`).join('');
    document.getElementById('wellness-root').innerHTML = `
      <div class="insight-card wellness-intro"><div class="wellness-eyebrow">DEIN PERSÖNLICHER WEG</div><h2>Ernährung trifft Fortschritt</h2><p class="settings-note">Ein nachvollziehbarer Startplan, deine Ziele in eigenen Worten und alle Körpermessungen an einem Ort.</p><button type="button" class="btn btn-secondary" id="btn-edit-profile">Körperprofil einrichten / bearbeiten</button></div>
      <div class="error-message" id="wellness-error" role="alert" hidden></div>
      <section class="insight-card" aria-labelledby="personal-plan-title"><h2 id="personal-plan-title">Dein Ernährungsziel</h2><div id="personal-plan"></div><button type="button" class="btn btn-primary" id="btn-apply-plan" hidden>Als Tagesziele übernehmen</button><p id="plan-applied-status" class="settings-note" role="status"></p></section>
      <section class="insight-card" aria-labelledby="coach-title"><h2 id="coach-title">Dein Ziel in eigenen Worten</h2><p class="settings-note">Zum Beispiel: „Ich möchte Muskeln aufbauen und etwas Fett verlieren.“ Die Zieleinordnung ändert deine Tagesziele erst nach dem Übernehmen.</p><div id="coach-messages" class="coach-messages" role="log" aria-live="polite" aria-label="Ziel-Gespräch"></div><form id="coach-form"><label class="form-label" for="coach-input">Was möchtest du erreichen?</label><textarea id="coach-input" class="form-input" rows="3" maxlength="2000" required></textarea><div class="backup-actions"><button type="button" class="btn btn-secondary" id="btn-coach-local">Offline einordnen</button><button type="submit" class="btn btn-primary" id="btn-coach-ai">Mit KI besprechen</button></div></form><p class="settings-note">„Mit KI besprechen“ sendet deinen Text, dein gespeichertes Körperprofil, den berechneten Plan und die letzten Gesprächsnachrichten an Google mit deinem Gemini API Key. Ohne KI bleibt der Zielrechner vollständig nutzbar.</p><p id="coach-status" role="status" class="settings-note" hidden></p><button type="button" class="btn btn-secondary" id="btn-coach-cancel" hidden>KI-Anfrage abbrechen</button><div id="coach-error" class="error-message" role="alert" hidden></div><div id="coach-suggestion" hidden><p id="coach-suggestion-text"></p><button type="button" class="btn btn-secondary" id="btn-coach-use">Zielausrichtung im Profil verwenden</button></div></section>
      <section class="insight-card" aria-labelledby="body-history-title"><h2 id="body-history-title">Deine Körperentwicklung</h2><div id="body-latest" class="body-latest"></div><div class="body-chart-controls"><div><label for="body-chart-metric" class="form-label">Messgröße</label><select id="body-chart-metric" class="form-input">${Object.entries(WellnessModel.metrics).map(([key, metric]) => `<option value="${key}">${metric.label} (${metric.unit})</option>`).join('')}</select></div><div><label for="body-chart-period" class="form-label">Zeitraum</label><select id="body-chart-period" class="form-input"><option value="all">Alles</option><option value="30">30 Tage</option><option value="90">90 Tage</option><option value="365">1 Jahr</option></select></div></div><div id="body-chart"></div><p id="body-trend" class="settings-note"></p><div id="body-target-progress"></div><p class="settings-note">BIA-Werte schwanken unter anderem mit Flüssigkeit und Messbedingungen. Vergleiche möglichst dasselbe Gerät unter ähnlichen Bedingungen. „Muskelmasse“ bezeichnet hier den Gerätewert und ist nicht automatisch Skelettmuskelmasse. Wasser und andere Anteile überlappen; sie werden nicht zu 100 % addiert.</p><div id="measurement-history"></div></section>
      <section class="insight-card" aria-labelledby="measurement-title"><h2 id="measurement-title">Messung manuell eintragen</h2><p class="settings-note">Leere Felder bedeuten „nicht gemessen“. Prozent (%) und Kilogramm (kg) getrennt eintragen.</p><form id="measurement-form"><input type="hidden" id="measure-id"><div class="wellness-grid"><div><label class="form-label" for="measure-date">Messdatum</label><input type="date" id="measure-date" class="form-input" required></div><div><label class="form-label" for="measure-time">Uhrzeit (optional)</label><input type="time" id="measure-time" class="form-input"></div>${this.metricInputs('measure')}</div><label class="form-label" for="measure-source">Gerät / Quelle</label><input id="measure-source" class="form-input" maxlength="100" value="Basic-Fit"><label class="form-label" for="measure-notes">Notiz (optional)</label><textarea id="measure-notes" class="form-input" maxlength="1000" rows="2"></textarea><div class="backup-actions"><button type="submit" class="btn btn-primary" id="btn-save-measurement">Messung speichern</button><button type="button" class="btn btn-secondary" id="btn-reset-measurement">Neue Messung / leeren</button></div></form><div id="measurement-error" class="error-message" role="alert" hidden></div></section>
      <section class="insight-card" aria-labelledby="screenshot-title"><h2 id="screenshot-title">Basic-Fit-Screenshots übernehmen</h2><p class="settings-note">Auch ältere Historien und mehrere Screenshots sind möglich. Die KI liest sichtbare Zahlen; du prüfst sie vor dem Speichern. Fehlende Datumsangaben musst du ergänzen.</p><label class="btn btn-secondary screenshot-picker" for="body-screenshots">Screenshots auswählen</label><input type="file" id="body-screenshots" accept="image/*" multiple class="visually-hidden"><div id="screenshot-previews" class="screenshot-previews"></div><p id="screenshot-count" class="settings-note"></p><p class="settings-note">Erst „Screenshots mit KI auslesen“ sendet die ausgewählten Bilder an Google. Schneide Namen oder andere private Inhalte bei Bedarf vorher aus. Bilder werden nicht dauerhaft gespeichert; übernommene Messungen bleiben auf deinem Gerät.</p><button type="button" class="btn btn-primary" id="btn-read-screenshots" disabled>Screenshots mit KI auslesen</button><div id="screenshot-loading" hidden><div class="nutrition-skeleton" aria-hidden="true"><div>Messdatum<span></span></div><div>Körperwerte<span></span></div></div><p id="screenshot-status" class="settings-note" role="status"></p></div><button type="button" class="btn btn-secondary mt-8" id="btn-screenshot-cancel" hidden>Auslesen abbrechen</button><div id="screenshot-error" class="error-message" role="alert" hidden></div><div id="screenshot-review" hidden><h3>Erkannte Messungen prüfen</h3><p class="plausibility-warning">KI-Ergebnisse können falsch sein. Datum, Einheiten und jede Zahl mit dem Original vergleichen. Nicht gewünschte Zeilen abwählen.</p><div id="screenshot-review-rows"></div><button type="button" class="btn btn-primary" id="btn-save-screenshot-rows">Geprüfte Messungen übernehmen</button><button type="button" class="btn btn-secondary mt-8" id="btn-discard-screenshot-rows">Ergebnisse verwerfen</button></div></section>
      <details class="insight-card wellness-sources"><summary>So werden deine Ziele berechnet</summary><p>Die verbreitete gerundete Mifflin-St-Jeor-Formel schätzt den Ruhebedarf aus Gewicht, Größe, Alter und Berechnungsvariante. Der gewählte Aktivitätsfaktor berücksichtigt Alltag und Sport zusammen; Trainingstage werden nicht nochmals als Kalorien addiert. Ohne Angabe der Variante wird der Mittelwert mit größerer Unsicherheit verwendet.</p><p>Unsere vorsichtigen Startwerte: Muskelaufbau +5 % (höchstens 200 kcal), Fettreduktion −10 % (höchstens 400 kcal), Erhalt und Körperrekomposition beim geschätzten Erhaltungsbedarf. Protein: 1,6 g/kg bei Erhalt, sonst 1,8 g/kg; Fett: rund 30 % der Energie; Kohlenhydrate: verbleibende Energie. Die Startwerte und die Unsicherheitsspanne sind Produktannahmen, keine klinisch validierte Individualmessung.</p><p>Die allgemeine Berechnung gilt hier für gesunde Erwachsene von 18 bis 78 Jahren im hinterlegten Anwendungsbereich. Bei Schwangerschaft, Stillzeit, medizinischen Ernährungsanforderungen und außerhalb dieses Bereichs gibt es keine automatische Zielvorgabe. Einzelne Waagenwerte ändern deine gespeicherten Tagesziele nicht automatisch.</p><p><a href="https://pubmed.ncbi.nlm.nih.gov/2305711/" target="_blank" rel="noopener">Mifflin & St Jeor: Originalstudie</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/28642676/" target="_blank" rel="noopener">ISSN: Protein und Training</a> · <a href="https://www.niddk.nih.gov/health-information/weight-management/body-weight-planner" target="_blank" rel="noopener">NIDDK: Anwendungsbereich von Bedarfsrechnern</a> · <a href="https://pubmed.ncbi.nlm.nih.gov/12165888/" target="_blank" rel="noopener">BIA und Flüssigkeitshaushalt</a></p></details>`;
    document.body.insertAdjacentHTML('beforeend', `<dialog id="profile-dialog" class="download-dialog wellness-dialog" aria-labelledby="profile-title"><div class="download-dialog-header"><h2 id="profile-title">Dein persönlicher Start</h2><button type="button" class="download-close" id="btn-profile-close" aria-label="Einrichtung später fortsetzen">×</button></div><p>Wie sieht dein Alltag aus und was möchtest du erreichen? Daraus berechnen wir einen Startvorschlag für Kalorien und Makronährstoffe.</p><form id="profile-form"><h3>1 · Deine Ausgangslage</h3><div class="wellness-grid"><div><label class="form-label" for="profile-heightCm">Größe (cm)</label><input id="profile-heightCm" type="number" min="100" max="250" step="0.1" class="form-input" inputmode="decimal" required></div><div><label class="form-label" for="profile-weightKg">Gewicht (kg)</label><input id="profile-weightKg" type="number" min="20" max="500" step="0.1" class="form-input" inputmode="decimal" required></div><div><label class="form-label" for="profile-age">Alter (Jahre)</label><input id="profile-age" type="number" min="1" max="110" step="1" class="form-input" inputmode="numeric" required></div><div><label class="form-label" for="profile-weightDate">Datum dieses Gewichts</label><input id="profile-weightDate" type="date" class="form-input" required></div></div><label class="form-label" for="profile-sex">Variante der Ruhebedarfsformel</label><select id="profile-sex" class="form-input" required><option value="">Bitte auswählen</option><option value="female">Weiblicher Formelwert</option><option value="male">Männlicher Formelwert</option><option value="unspecified">Keine Angabe / Mittelwert</option></select><p class="settings-note">Die ursprüngliche Formel verwendet zwei Geschlechtskoeffizienten. Bei „keine Angabe“ ist die Schätzung zusätzlich unsicher; Hormontherapien und individuelle Unterschiede werden nicht abgebildet.</p><h3>2 · Alltag & Training</h3><label class="form-label" for="profile-activity">Gesamte Aktivität einschließlich Sport</label><select id="profile-activity" class="form-input" required><option value="">Bitte auswählen</option><option value="sedentary">Wenig aktiv – überwiegend sitzen, kaum Sport</option><option value="light">Leicht aktiv – etwas Bewegung / leichter Sport</option><option value="moderate">Mittel aktiv – regelmäßig bewegen und trainieren</option><option value="high">Sehr aktiv – viel Bewegung und intensives Training</option><option value="veryHigh">Extrem aktiv – körperliche Arbeit und viel Sport</option></select><label class="form-label" for="profile-trainingDays">Trainingstage pro Woche</label><input id="profile-trainingDays" type="number" min="0" max="7" step="1" value="0" class="form-input" inputmode="numeric" required><h3>3 · Dein Ziel</h3><label class="form-label" for="profile-goalText">Beschreibe deinen Wunsch (optional)</label><textarea id="profile-goalText" class="form-input" maxlength="2000" rows="3" placeholder="Ich möchte Muskeln aufbauen und im Gym stärker werden."></textarea><div class="backup-actions"><button type="button" class="btn btn-secondary" id="btn-profile-local">Text offline einordnen</button><button type="button" class="btn btn-secondary" id="btn-profile-ai">Text mit KI einordnen</button></div><p id="profile-ai-status" class="settings-note" role="status"></p><p class="settings-note">Die KI-Schaltfläche sendet deinen Zieltext und, falls vorhanden, dein gespeichertes Profil samt Gesprächskontext an Google. Sie braucht deinen Gemini API Key; ohne Schlüssel wähle das Ziel direkt.</p><label class="form-label" for="profile-goal">Zielausrichtung</label><select id="profile-goal" class="form-input">${options}</select><label class="form-label" for="profile-targetWeightKg">Wunschgewicht (kg, optional)</label><input id="profile-targetWeightKg" type="number" min="20" max="500" step="0.1" class="form-input" inputmode="decimal"><label class="form-label" for="profile-preferences">Essenswünsche / Unverträglichkeiten (optional)</label><textarea id="profile-preferences" class="form-input" rows="2" maxlength="1000" placeholder="Zum Beispiel vegetarisch oder laktosefrei"></textarea><label class="wellness-check"><input type="checkbox" id="profile-specialSituation"><span>Schwangerschaft, Stillzeit oder besondere medizinische Ernährungsanforderungen, z. B. Nierenerkrankung oder Essstörung. In diesem Fall möchte ich ausschließlich selbst festgelegte Ziele nutzen.</span></label><div class="error-message" id="profile-error" role="alert" hidden></div><button type="submit" class="btn btn-primary" id="btn-profile-save">Profil speichern & Vorschlag ansehen</button><button type="button" class="btn btn-secondary mt-8" id="btn-profile-skip">Später einrichten</button><p class="settings-note">Deine Angaben bleiben lokal und werden mit deinen Backups gesichert. Berechnungen sind Schätzungen und ersetzen keine individuelle Ernährungsberatung. Vorhandene Tagesziele werden erst beim ausdrücklichen Übernehmen ersetzt.</p></form></dialog>`);
    document.querySelector('.calorie-hero').insertAdjacentHTML('afterend', '<div id="dashboard-wellness" class="insight-card dashboard-wellness"></div>');
    document.getElementById('measure-date').value = Storage.getToday();
    document.getElementById('profile-weightDate').value = Storage.getToday();
    document.getElementById('profile-goal').value = 'maintain';
    for (const id of ['measure-date', 'profile-weightDate']) document.getElementById(id).max = Storage.getToday();
  },
  metricInputs(prefix, row = {}) {
    return Object.entries(WellnessModel.metrics).map(([key, metric]) => `<div><label class="form-label" for="${prefix}-${key}">${metric.label} (${metric.unit})</label><input type="number" id="${prefix}-${key}" data-metric="${key}" class="form-input" min="${metric.min}" max="${metric.max}" step="0.1" inputmode="decimal" value="${row[key] ?? ''}"></div>`).join('');
  },
  bind() {
    const click = (id, fn, errorId) => document.getElementById(id).addEventListener('click', () => this.act(fn, errorId));
    click('btn-edit-profile', () => this.openProfile());
    click('btn-settings-body', () => App.navigateTo('body'));
    click('btn-profile-close', () => this.skipProfile(), 'profile-error');
    click('btn-profile-skip', () => this.skipProfile(), 'profile-error');
    document.getElementById('profile-dialog').addEventListener('cancel', event => { event.preventDefault(); this.act(() => this.skipProfile(), 'profile-error'); });
    document.getElementById('profile-dialog').addEventListener('close', () => this.coachController?.abort());
    document.getElementById('profile-form').addEventListener('submit', event => { event.preventDefault(); this.act(() => this.saveProfile(), 'profile-error'); });
    click('btn-profile-local', () => {
      const goal = WellnessModel.inferGoal(document.getElementById('profile-goalText').value);
      if (!goal) throw new Error('Das Ziel ist nicht eindeutig. Bitte die Zielausrichtung unten direkt auswählen.');
      document.getElementById('profile-goal').value = goal;
      this.persistField(document.getElementById('profile-goal'));
      document.getElementById('profile-ai-status').textContent = `Offline erkannt: ${WellnessModel.goals[goal]}. Bitte prüfen.`;
    }, 'profile-error');
    click('btn-profile-ai', () => this.profileAI(), 'profile-error');
    document.getElementById('profile-goalText').addEventListener('input', event => {
      const goal = WellnessModel.inferGoal(event.target.value);
      if (goal) {
        document.getElementById('profile-goal').value = goal;
        this.act(() => this.persistField(document.getElementById('profile-goal')));
      }
    });
    click('btn-apply-plan', async () => {
      if (this.applying) return; this.applying = true;
      try { await Storage.applyWellnessPlan(); App.loadSettings(); App.showToast('Persönliche Tagesziele übernommen.', 'success'); }
      finally { this.applying = false; }
    });
    click('btn-coach-local', () => this.coach(false), 'coach-error');
    document.getElementById('coach-form').addEventListener('submit', event => { event.preventDefault(); this.act(() => this.coach(true), 'coach-error'); });
    click('btn-coach-cancel', () => this.coachController?.abort(), 'coach-error');
    click('btn-coach-use', async () => {
      if (!this.suggestedGoal) return;
      const state = Storage.getWellness();
      if (!state.profile) { this.openProfile(); document.getElementById('profile-goal').value = this.suggestedGoal; return; }
      await Storage.saveProfile({ ...state.profile, goal: this.suggestedGoal, goalText: this.lastGoalText });
      this.suggestedGoal = null;
      document.getElementById('coach-suggestion').hidden = true;
      App.showToast('Zielausrichtung gespeichert. Den neuen Plan oben prüfen und bei Bedarf übernehmen.', 'success');
    }, 'coach-error');
    document.getElementById('measurement-form').addEventListener('submit', event => { event.preventDefault(); this.act(() => this.saveMeasurement(), 'measurement-error'); });
    click('btn-reset-measurement', () => this.resetMeasurement(), 'measurement-error');
    for (const formId of ['profile-form', 'measurement-form', 'coach-form']) {
      document.getElementById(formId).addEventListener('input', event => this.act(() => this.persistField(event.target)));
      document.getElementById(formId).addEventListener('change', event => this.act(() => this.persistField(event.target)));
    }
    document.getElementById('body-chart-metric').addEventListener('change', event => { this.chartMetric = event.target.value; this.renderChart(); });
    document.getElementById('body-chart-period').addEventListener('change', event => { this.chartPeriod = event.target.value; this.renderChart(); });
    document.getElementById('measurement-history').addEventListener('click', event => this.act(async () => {
      const edit = event.target.closest('[data-edit-measurement]');
      const remove = event.target.closest('[data-delete-measurement]');
      if (edit) this.editMeasurement(edit.dataset.editMeasurement);
      if (remove && confirm('Diese Körpermessung wirklich löschen?')) await Storage.deleteMeasurement(remove.dataset.deleteMeasurement);
    }));
    document.getElementById('body-screenshots').addEventListener('change', event => this.act(() => this.selectScreenshots(event.target), 'screenshot-error'));
    click('btn-read-screenshots', () => this.readScreenshots(), 'screenshot-error');
    click('btn-screenshot-cancel', () => this.controller?.abort(), 'screenshot-error');
    click('btn-save-screenshot-rows', () => this.saveScreenshotRows(), 'screenshot-error');
    click('btn-discard-screenshot-rows', () => { this.pendingRows = []; document.getElementById('screenshot-review').hidden = true; }, 'screenshot-error');
  },
  persistField(input) {
    if (!input.id || !/^(profile|measure)-[a-zA-Z]+$|^coach-input$/.test(input.id)) return;
    return Storage.saveWellnessDraft(input.id, input.type === 'checkbox' ? String(input.checked) : input.value);
  },
  restoreDrafts() {
    for (const [id, value] of Object.entries(Storage.state.wellness.draft)) {
      const input = document.getElementById(id); if (!input) continue;
      if (input.type === 'checkbox') input.checked = value === 'true'; else input.value = value;
    }
  },
  resetUI() {
    this.controller?.abort(); this.coachController?.abort();
    document.getElementById('profile-form').reset();
    document.getElementById('profile-goal').value = 'maintain';
    document.getElementById('profile-weightDate').value = Storage.getToday();
    this.resetMeasurement(false);
    this.suggestedGoal = null; this.pendingRows = []; this.files = [];
    this.releasePreviews();
    document.getElementById('screenshot-previews').replaceChildren();
    document.getElementById('screenshot-count').textContent = '';
    document.getElementById('coach-input').value = '';
    document.getElementById('btn-read-screenshots').disabled = true;
    document.getElementById('profile-ai-status').textContent = '';
    for (const id of ['screenshot-review', 'coach-suggestion', 'profile-error', 'measurement-error', 'coach-error', 'screenshot-error']) document.getElementById(id).hidden = true;
    this.render();
  },
  openProfile() {
    const state = Storage.getWellness();
    if (state.profile) for (const [key, value] of Object.entries(state.profile)) {
      const input = document.getElementById(`profile-${key}`); if (!input) continue;
      if (input.type === 'checkbox') input.checked = value; else input.value = value ?? '';
    }
    this.restoreDrafts();
    document.getElementById('profile-error').hidden = true;
    if (!document.getElementById('profile-dialog').open) document.getElementById('profile-dialog').showModal();
  },
  async skipProfile() {
    await Storage.finishOnboarding(Storage.state.wellness.profile ? 'done' : 'skipped');
    document.getElementById('profile-dialog').close();
  },
  readProfile() {
    const value = key => document.getElementById(`profile-${key}`).value;
    return WellnessModel.profile({ heightCm: Number(value('heightCm')), weightKg: Number(value('weightKg')), age: Number(value('age')),
      weightDate: value('weightDate'), sex: value('sex'), activity: value('activity'), goal: value('goal'), trainingDays: Number(value('trainingDays')),
      targetWeightKg: value('targetWeightKg') === '' ? null : Number(value('targetWeightKg')), goalText: value('goalText'), preferences: value('preferences'), specialSituation: document.getElementById('profile-specialSituation').checked });
  },
  async saveProfile() {
    if (this.savingProfile) return; this.savingProfile = true;
    try {
      await Storage.saveProfile(this.readProfile());
      await Storage.finishOnboarding();
      document.getElementById('profile-dialog').close();
      App.navigateTo('body');
      App.showToast('Profil gespeichert. Prüfe jetzt deinen Startvorschlag.', 'success');
    } finally { this.savingProfile = false; }
  },
  async profileAI() {
    if (this.coachController) return;
    this.coachController = new AbortController();
    const button = document.getElementById('btn-profile-ai'); button.disabled = true;
    try {
      const result = await WellnessAI.interpretGoal(document.getElementById('profile-goalText').value, Storage.getWellness(), { signal: this.coachController.signal, onProgress: text => { document.getElementById('profile-ai-status').textContent = text; } });
      if (result.goal !== 'unclear') { document.getElementById('profile-goal').value = result.goal; await this.persistField(document.getElementById('profile-goal')); }
      document.getElementById('profile-ai-status').textContent = result.explanation;
    } finally { this.coachController = null; button.disabled = false; }
  },
  async coach(useAI) {
    if (this.coachBusy) return;
    const input = document.getElementById('coach-input');
    const text = input.value.trim(); if (!text) throw new Error('Bitte zuerst dein Ziel beschreiben.');
    this.coachBusy = true;
    this.suggestedGoal = null;
    document.getElementById('coach-suggestion').hidden = true;
    const status = document.getElementById('coach-status'); status.hidden = false;
    document.getElementById('btn-coach-ai').disabled = document.getElementById('btn-coach-local').disabled = input.disabled = true;
    document.getElementById('btn-coach-cancel').hidden = !useAI;
    try {
      const state = Storage.getWellness();
      let result;
      if (useAI) {
        this.coachController = new AbortController();
        result = await WellnessAI.interpretGoal(text, state, { signal: this.coachController.signal, onProgress: message => { status.textContent = message; } });
      } else {
        const plan = state.profile ? WellnessModel.plan(state.profile, state.measurements) : null;
        const goal = WellnessModel.inferGoal(text);
        result = plan && !plan.eligible ? { goal: 'unclear', explanation: plan.reason } : {
          goal: goal || 'unclear', explanation: goal ? `Offline eingeordnet: ${WellnessModel.goals[goal]}. Prüfe die Zielausrichtung. Der Startplan wird anhand deines Körperprofils lokal berechnet; deine bisherigen Tagesziele bleiben bis zum Übernehmen erhalten.` : 'Das Ziel ist nicht eindeutig. Möchtest du Muskeln aufbauen, Fett reduzieren, beides kombinieren oder dein Gewicht halten? Du kannst es auch direkt im Körperprofil auswählen.'
        };
      }
      await Storage.addWellnessMessage('user', text);
      await Storage.addWellnessMessage('assistant', result.explanation);
      input.value = '';
      this.lastGoalText = text;
      if (result.goal !== 'unclear') {
        this.suggestedGoal = result.goal;
        document.getElementById('coach-suggestion-text').textContent = `Vorschlag: ${WellnessModel.goals[result.goal]}`;
        document.getElementById('coach-suggestion').hidden = false;
      }
    } finally {
      this.coachBusy = false; this.coachController = null; status.hidden = true;
      document.getElementById('btn-coach-ai').disabled = document.getElementById('btn-coach-local').disabled = input.disabled = false;
      document.getElementById('btn-coach-cancel').hidden = true;
    }
  },
  render() {
    if (!document.getElementById('wellness-root')?.children.length) return;
    const state = Storage.getWellness();
    this.renderPlan(state);
    this.renderHistory(state);
    this.renderChart();
    document.getElementById('coach-messages').innerHTML = state.messages.map(message => `<div class="coach-message ${message.role}"><span>${message.role === 'user' ? 'Du' : 'Ziel-Assistent'}</span><p>${this.esc(message.text)}</p></div>`).join('');
    const latestWeight = state.profile ? WellnessModel.weight(state.profile, state.measurements) : null;
    const current = Storage.getGoals();
    document.getElementById('dashboard-wellness').innerHTML = `<div class="wellness-eyebrow">DEIN KÖRPERPROFIL</div><h2>${state.profile ? this.esc(WellnessModel.goals[state.profile.goal]) : 'Was möchtest du erreichen?'}</h2><p class="settings-note">${state.profile ? `${this.format(latestWeight.value, 'kg')} · ${current.calories != null ? this.format(current.calories, 'kcal Tagesziel') : 'Noch kein Tagesziel übernommen'}` : 'Richte deinen persönlichen Startplan ein und verfolge deine Körpermessungen.'}</p><button type="button" class="text-action" id="btn-dashboard-body">${state.profile ? 'Plan & Fortschritt ansehen →' : 'Körperprofil einrichten →'}</button>`;
    document.getElementById('btn-dashboard-body').addEventListener('click', () => { if (!state.profile) this.openProfile(); else App.navigateTo('body'); });
  },
  renderPlan(state) {
    const container = document.getElementById('personal-plan'), apply = document.getElementById('btn-apply-plan');
    apply.hidden = true;
    document.getElementById('plan-applied-status').textContent = '';
    if (!state.profile) { container.innerHTML = '<p class="settings-note">Bitte zuerst dein Körperprofil einrichten. Du kannst die App auch mit eigenen Tageszielen nutzen.</p>'; return; }
    const plan = WellnessModel.plan(state.profile, state.measurements);
    if (!plan.eligible) { container.innerHTML = `<p class="plausibility-warning">${this.esc(plan.reason)}</p>`; return; }
    const goals = plan.goals;
    container.innerHTML = `<div class="personal-calorie-target"><strong>${this.format(goals.calories)}</strong><span>kcal pro Tag · Startvorschlag</span></div><div class="plan-macros">${[['protein', 'Protein'], ['carbs', 'Kohlenhydrate'], ['fat', 'Fett']].map(([key, label]) => `<div><strong>${this.format(goals[key], 'g')}</strong><span>${label}</span></div>`).join('')}</div><p>${this.esc(WellnessModel.goals[plan.goal])} · ${plan.adjustment >= 0 ? '+' : ''}${this.format(plan.adjustment, 'kcal')} zum geschätzten Erhalt.</p><p class="settings-note">Berechnet mit ${this.format(plan.weight.value, 'kg')} vom ${this.esc(Storage.getDisplayDate(plan.weight.date))}. Ruhebedarf ca. ${this.format(plan.bmr, 'kcal')}, Aktivitätsfaktor ${plan.factor.toLocaleString('de-DE', { maximumFractionDigits: 3 })}, Erhalt ca. ${this.format(plan.maintenance, 'kcal')}. Grobe Erhaltsspanne ${this.format(plan.range[0])}–${this.format(plan.range[1], 'kcal')}; tatsächlicher Bedarf kann stärker abweichen.</p><p class="settings-note">Beobachte Energie, Trainingsleistung und mehrere Wochen Verlauf. Schwankende BIA-Werte führen nicht automatisch zu einer Kalorienänderung.</p>`;
    apply.hidden = false;
    const current = Storage.getGoals();
    const same = Object.keys(goals).every(key => current[key] === goals[key]);
    apply.textContent = same ? 'Tagesziele entsprechen diesem Vorschlag' : 'Als Tagesziele übernehmen';
    apply.disabled = same;
    if (state.appliedPlan) document.getElementById('plan-applied-status').textContent = `Zuletzt übernommen: ${new Date(state.appliedPlan.createdAt).toLocaleString('de-DE')}. Manuell geänderte Ziele werden erst nach erneutem Übernehmen ersetzt.`;
  },
  renderHistory(state) {
    const rows = [...state.measurements].sort((a, b) => (b.date + (b.time || '')).localeCompare(a.date + (a.time || '')));
    const highlights = ['weightKg', 'bodyFatPct', 'musclePct', 'waterPct'];
    document.getElementById('body-latest').innerHTML = highlights.map(key => {
      const latest = rows.find(row => row[key] != null);
      const baseline = key === 'weightKg' && state.profile ? { date: state.profile.weightDate, weightKg: state.profile.weightKg } : null;
      const row = latest && (!baseline || latest.date >= baseline.date) ? latest : baseline;
      return `<div><span>${WellnessModel.metrics[key].label}</span><strong>${this.format(row?.[key], WellnessModel.metrics[key].unit)}</strong><small>${row ? this.esc(Storage.getDisplayDate(row.date)) : 'Noch kein Messwert'}</small></div>`;
    }).join('');
    document.getElementById('measurement-history').innerHTML = rows.length ? `<h3>Messhistorie · ${rows.length}</h3><div class="measurement-list">${rows.map(row => `<article class="measurement-row"><div class="measurement-row-heading"><strong>${this.esc(Storage.getDisplayDate(row.date))}${row.time ? ' · ' + this.esc(row.time) : ' · ohne Uhrzeit'}</strong><span>${this.esc(row.source)}</span></div><div class="measurement-values">${Object.entries(WellnessModel.metrics).filter(([key]) => row[key] != null).map(([key, metric]) => `<span>${metric.label}: <strong>${this.format(row[key], metric.unit)}</strong></span>`).join('')}</div>${row.notes ? `<p class="settings-note">${this.esc(row.notes)}</p>` : ''}<div class="backup-actions"><button type="button" class="text-action" data-edit-measurement="${row.id}">Bearbeiten</button><button type="button" class="text-action" data-delete-measurement="${row.id}">Löschen</button></div></article>`).join('')}</div>` : '<p class="settings-note">Noch keine Körpermessungen. Trage unten Werte ein oder lies einen Screenshot aus.</p>';
    const target = state.profile?.targetWeightKg;
    const current = state.profile ? WellnessModel.weight(state.profile, state.measurements).value : null;
    document.getElementById('body-target-progress').innerHTML = target && current ? `<p class="target-distance">Wunschgewicht: <strong>${this.format(target, 'kg')}</strong> · Abstand aktuell ${this.format(Math.abs(current - target), 'kg')}. Ein Wunschgewicht ist kein garantiertes Ergebnis oder fester Zeitplan.</p>` : '';
  },
  renderChart() {
    const state = Storage.getWellness();
    let rows = [...state.measurements];
    if (this.chartMetric === 'weightKg' && state.profile && !rows.some(row => row.date === state.profile.weightDate && row.weightKg != null)) rows.push({ date: state.profile.weightDate, weightKg: state.profile.weightKg });
    if (this.chartPeriod !== 'all') {
      const cutoff = new Date(Storage.getToday() + 'T12:00:00'); cutoff.setDate(cutoff.getDate() - Number(this.chartPeriod));
      rows = rows.filter(row => row.date >= Storage.formatDate(cutoff));
    }
    const trend = WellnessModel.trend(rows, this.chartMetric);
    const points = trend.points, metric = WellnessModel.metrics[this.chartMetric];
    const container = document.getElementById('body-chart');
    if (points.length < 2) {
      container.innerHTML = `<div class="body-chart-empty">${points.length ? `${this.format(points[0].value, metric.unit)} am ${this.esc(Storage.getDisplayDate(points[0].date))}. Für einen Verlauf fehlen weitere Messtage.` : 'Noch keine Werte für diese Messgröße im gewählten Zeitraum.'}</div>`;
      document.getElementById('body-trend').textContent = '';
      return;
    }
    const width = 600, height = 220, left = 58, right = 24, top = 20, bottom = 40;
    const values = points.map(point => point.value), min = Math.min(...values), max = Math.max(...values);
    const padding = Math.max((max - min) * .2, metric.unit === 'kg' ? .5 : 1);
    const low = Math.max(0, min - padding), high = max + padding;
    const start = Date.parse(points[0].date + 'T12:00:00Z'), end = Date.parse(points.at(-1).date + 'T12:00:00Z');
    const x = point => left + (Date.parse(point.date + 'T12:00:00Z') - start) / (end - start) * (width - left - right);
    const y = value => top + (high - value) / (high - low) * (height - top - bottom);
    const labels = [low, (low + high) / 2, high];
    container.innerHTML = `<svg viewBox="0 0 ${width} ${height}" role="img" aria-label="${metric.label}: ${this.format(points[0].value)} bis ${this.format(points.at(-1).value, metric.unit)} über ${points.length} Messtage"><title>${metric.label} im Verlauf. Y-Achse ist zur besseren Sichtbarkeit gekürzt.</title>${labels.map(value => `<line x1="${left}" y1="${y(value)}" x2="${width - right}" y2="${y(value)}" class="chart-grid"/><text x="${left - 8}" y="${y(value) + 4}" text-anchor="end">${this.format(value)}</text>`).join('')}<polyline points="${points.map(point => `${x(point)},${y(point.value)}`).join(' ')}" class="body-chart-line"/>${points.map(point => `<circle cx="${x(point)}" cy="${y(point.value)}" r="4" class="body-chart-point"><title>${point.date}: ${this.format(point.value, metric.unit)}</title></circle>`).join('')}<text x="${left}" y="${height - 10}">${this.esc(points[0].date.split('-').reverse().join('.'))}</text><text x="${width - right}" y="${height - 10}" text-anchor="end">${this.esc(points.at(-1).date.split('-').reverse().join('.'))}</text></svg><p class="settings-note">${metric.label} (${metric.unit}) · Tagesmedian · Y-Achse gekürzt</p>`;
    const delta = points.at(-1).value - points[0].value;
    document.getElementById('body-trend').textContent = `Veränderung im Zeitraum: ${delta >= 0 ? '+' : ''}${this.format(delta, metric.unit === '%' ? 'Prozentpunkte' : metric.unit)}. ${trend.weekly == null ? 'Für eine geglättete Wochenrate sind mindestens 6 Messtage über 14 Tage innerhalb von 21 Kalendertagen vor der neuesten Messung nötig.' : `Geglätteter Trend: ${trend.weekly >= 0 ? '+' : ''}${this.format(trend.weekly, metric.unit === '%' ? 'Prozentpunkte/Woche' : metric.unit + '/Woche')}. Das ist keine Vorhersage.`}`;
  },
  readMeasurement(prefix = 'measure') {
    const value = key => document.getElementById(`${prefix}-${key}`).value;
    const row = { date: value('date') || null, time: value('time') || null, source: value('source'), notes: value('notes') };
    for (const key of Object.keys(WellnessModel.metrics)) row[key] = value(key) === '' ? null : Number(value(key));
    return WellnessModel.measurement(row);
  },
  async saveMeasurement() {
    if (this.savingMeasurement) return; this.savingMeasurement = true;
    try {
      const stats = await Storage.saveMeasurements([this.readMeasurement()], document.getElementById('measure-id').value || null);
      this.resetMeasurement(false);
      App.showToast(stats.skipped ? 'Diese Messung ist bereits vorhanden.' : 'Körpermessung gespeichert.', 'success');
    } finally { this.savingMeasurement = false; }
  },
  resetMeasurement(clearDraft = true) {
    document.getElementById('measurement-form').reset();
    document.getElementById('measure-id').value = '';
    document.getElementById('measure-date').value = Storage.getToday();
    if (clearDraft) return Storage.commit(state => {
      for (const key of Object.keys(state.wellness.draft)) if (key.startsWith('measure-')) delete state.wellness.draft[key];
      return state;
    }, 'draft');
  },
  editMeasurement(id) {
    const row = Storage.getWellness().measurements.find(item => item.id === id); if (!row) return;
    for (const [key, value] of Object.entries(row)) {
      const input = document.getElementById(`measure-${key}`); if (input) { input.value = value ?? ''; this.act(() => this.persistField(input)); }
    }
    document.getElementById('measurement-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
  },
  releasePreviews() { for (const url of this.previewUrls) URL.revokeObjectURL(url); this.previewUrls = []; },
  selectScreenshots(input) {
    const files = [...input.files]; input.value = '';
    if (!files.length) return;
    if (files.length > 6 || files.some(file => !file.type.startsWith('image/') || file.size > 25 * 1024 * 1024)) throw new Error('Bitte höchstens 6 Bilder mit jeweils maximal 25 MB auswählen.');
    this.releasePreviews(); this.files = files; this.pendingRows = [];
    document.getElementById('screenshot-review').hidden = true;
    const previews = document.getElementById('screenshot-previews'); previews.replaceChildren();
    for (const file of files) {
      const url = URL.createObjectURL(file); this.previewUrls.push(url);
      const img = document.createElement('img'); img.src = url; img.alt = `Vorschau: ${file.name}`; previews.appendChild(img);
    }
    document.getElementById('screenshot-count').textContent = `${files.length} Screenshot${files.length === 1 ? '' : 's'} ausgewählt. Noch nicht gesendet.`;
    document.getElementById('btn-read-screenshots').disabled = false;
  },
  async readScreenshots() {
    if (this.controller || !this.files.length) return;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    const status = document.getElementById('screenshot-status');
    const button = document.getElementById('btn-read-screenshots'); button.disabled = true;
    document.getElementById('body-screenshots').disabled = true;
    document.getElementById('screenshot-loading').hidden = document.getElementById('btn-screenshot-cancel').hidden = false;
    document.getElementById('screenshot-review').hidden = true;
    status.textContent = 'Screenshots werden lesbar komprimiert …';
    try {
      const images = await WellnessAI.prepareScreenshots(this.files, signal);
      this.pendingRows = await WellnessAI.extractMeasurements(images, { signal, onProgress: text => { status.textContent = text; } });
      signal.throwIfAborted();
      this.renderScreenshotReview();
    } catch (error) {
      if (signal.aborted) throw new Error('Auslesen abgebrochen. Es wurden keine Messungen übernommen.');
      throw error;
    } finally {
      this.controller = null; button.disabled = !this.files.length;
      document.getElementById('body-screenshots').disabled = false;
      document.getElementById('screenshot-loading').hidden = document.getElementById('btn-screenshot-cancel').hidden = true;
    }
  },
  renderScreenshotReview() {
    document.getElementById('screenshot-review-rows').innerHTML = this.pendingRows.map((row, index) => {
      const prefix = `review-${index}`;
      return `<fieldset class="measurement-review-row"><legend>Messung ${index + 1}</legend><label class="wellness-check"><input type="checkbox" id="${prefix}-include" checked><span>Diese Messung übernehmen</span></label><div class="wellness-grid"><div><label class="form-label" for="${prefix}-date">Messdatum${row.date ? '' : ' · bitte ergänzen'}</label><input type="date" id="${prefix}-date" class="form-input" value="${row.date || ''}" max="${Storage.getToday()}" required></div><div><label class="form-label" for="${prefix}-time">Uhrzeit (optional)</label><input type="time" id="${prefix}-time" class="form-input" value="${row.time || ''}"></div>${this.metricInputs(prefix, row)}</div><label class="form-label" for="${prefix}-source">Quelle</label><input id="${prefix}-source" class="form-input" maxlength="100" value="${this.esc(row.source)}"><label class="form-label" for="${prefix}-notes">Hinweise / Notiz</label><textarea id="${prefix}-notes" class="form-input" maxlength="1000" rows="2">${this.esc(row.notes)}</textarea></fieldset>`;
    }).join('');
    document.getElementById('screenshot-review').hidden = false;
  },
  async saveScreenshotRows() {
    if (this.savingScreenshots || !this.pendingRows.length) return;
    this.savingScreenshots = true;
    try {
      const rows = [];
      for (let index = 0; index < this.pendingRows.length; index++) {
        if (!document.getElementById(`review-${index}-include`).checked) continue;
        const fieldset = document.getElementById(`review-${index}-include`).closest('fieldset');
        for (const input of fieldset.querySelectorAll('input')) if (!input.checkValidity()) { input.reportValidity(); throw new Error(`Bitte Messung ${index + 1} prüfen: Datum oder Messwert fehlt bzw. ist ungültig.`); }
        rows.push(this.readMeasurement(`review-${index}`));
      }
      if (!rows.length) throw new Error('Bitte mindestens eine geprüfte Messung auswählen.');
      const stats = await Storage.saveMeasurements(rows);
      this.pendingRows = []; this.files = []; this.releasePreviews();
      document.getElementById('screenshot-previews').replaceChildren();
      document.getElementById('screenshot-count').textContent = '';
      document.getElementById('btn-read-screenshots').disabled = true;
      document.getElementById('screenshot-review').hidden = true;
      App.showToast(`${stats.added} neu, ${stats.merged} ergänzt, ${stats.skipped} bereits vorhanden.`, 'success');
    } finally { this.savingScreenshots = false; }
  }
};
