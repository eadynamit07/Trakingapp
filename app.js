// ============================================
// KCal Tracker - Main App Controller
// Navigation, dashboard, event handlers
// ============================================

const App = {
  currentDate: null,
  currentScreen: 'dashboard',
  barcodeProductData: null, // Store barcode product data for calculations
  calendarYear: null,
  calendarMonth: null,
  calendarSelectedDate: null,
  pendingDeleteId: null,

  // =====================
  // Initialization
  // =====================
  init() {
    // Initialize local settings
    Storage.init();

    // Set current date to today
    this.currentDate = Storage.getToday();
    const todayObj = new Date();
    this.calendarYear = todayObj.getFullYear();
    this.calendarMonth = todayObj.getMonth();
    this.calendarSelectedDate = this.currentDate;

    // Setup all event listeners
    this.setupNavigation();
    this.setupDateNav();
    this.setupWeekStrip();
    this.setupCalendar();
    this.setupAddDateBanner();
    this.setupDeleteModal();
    this.setupManualEntry();
    this.setupPhotoEntry();
    this.setupTextParser();
    this.setupBarcodeScanner();
    this.setupSettings();
    this.setupCategorySelectors();

    // Render dashboard
    this.renderDashboard();

    // Load settings into form
    this.loadSettings();

    // Register service worker
    this.registerSW();
  },

  // =====================
  // Service Worker
  // =====================
  registerSW() {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').catch(err => {
        console.log('SW registration failed:', err);
      });
    }
  },

  // =====================
  // Navigation
  // =====================
  setupNavigation() {
    document.querySelectorAll('.nav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const screen = btn.dataset.screen;
        this.navigateTo(screen);
      });
    });

    // Header date display & calendar quick button
    document.getElementById('date-display-trigger')?.addEventListener('click', () => {
      this.calendarSelectedDate = this.currentDate;
      const d = new Date(this.currentDate + 'T00:00:00');
      this.calendarYear = d.getFullYear();
      this.calendarMonth = d.getMonth();
      this.navigateTo('calendar');
    });

    document.getElementById('btn-open-calendar-quick')?.addEventListener('click', () => {
      this.calendarSelectedDate = this.currentDate;
      const d = new Date(this.currentDate + 'T00:00:00');
      this.calendarYear = d.getFullYear();
      this.calendarMonth = d.getMonth();
      this.navigateTo('calendar');
    });
  },

  navigateTo(screenId) {
    // Stop any active camera/scanner when leaving
    if (this.currentScreen === 'add') {
      this.resetPhotoCamera();
      BarcodeScanner.stop();
    }

    this.currentScreen = screenId;

    // Update screens
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const targetScreen = document.getElementById(`screen-${screenId}`);
    if (targetScreen) targetScreen.classList.add('active');

    // Update nav buttons
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    const targetBtn = document.querySelector(`.nav-btn[data-screen="${screenId}"]`);
    if (targetBtn) targetBtn.classList.add('active');

    // Screen specific refresh
    if (screenId === 'dashboard') {
      this.renderDashboard();
    } else if (screenId === 'calendar') {
      this.renderCalendar();
    } else if (screenId === 'add') {
      this.syncAddDateInput();
    }
  },

  // =====================
  // Method Tabs (Add Screen)
  // =====================
  setupMethodTabs() {
    // Already set up via setupCategorySelectors and inline
  },

  // =====================
  // Date Navigation
  // =====================
  setupDateNav() {
    document.getElementById('btn-prev-day').addEventListener('click', () => {
      this.changeDate(-1);
    });
    document.getElementById('btn-next-day').addEventListener('click', () => {
      this.changeDate(1);
    });
  },

  changeDate(delta) {
    const current = new Date(this.currentDate + 'T00:00:00');
    current.setDate(current.getDate() + delta);
    this.currentDate = Storage.formatDate(current);
    this.calendarSelectedDate = this.currentDate;
    this.renderDashboard();
  },

  // =====================
  // Dashboard Rendering
  // =====================
  renderDashboard() {
    const dateStr = this.currentDate;
    const totals = Storage.getDayTotals(dateStr);
    const goals = Storage.getGoals();
    const entries = Storage.getEntriesByDate(dateStr);

    // Update date display
    document.getElementById('date-main').textContent = Storage.getDisplayDate(dateStr);
    const today = Storage.getToday();
    if (dateStr !== today) {
      document.getElementById('date-weekday').textContent = Storage.getWeekday(dateStr);
    } else {
      document.getElementById('date-weekday').textContent = '';
    }

    // Update calorie ring
    const calValue = document.getElementById('cal-value');
    const calGoal = document.getElementById('cal-goal');
    const calRing = document.getElementById('cal-ring');
    const circumference = 2 * Math.PI * 78; // ~490.09

    calValue.textContent = Math.round(totals.calories);

    if (goals.calories) {
      const progress = Math.min(totals.calories / goals.calories, 1);
      calRing.style.strokeDashoffset = circumference * (1 - progress);
      calGoal.textContent = `von ${goals.calories} kcal`;
    } else {
      calRing.style.strokeDashoffset = circumference; // No ring
      calGoal.textContent = '';
    }

    // Update macro cards
    this.updateMacroCard('protein', totals.protein, goals.protein);
    this.updateMacroCard('carbs', totals.carbs, goals.carbs);
    this.updateMacroCard('fat', totals.fat, goals.fat);

    // Render week strip
    this.renderWeekStrip();

    // Render meal list
    this.renderMealList(entries);
  },

  updateMacroCard(type, value, goal) {
    document.getElementById(`macro-${type}`).textContent = Math.round(value * 10) / 10;
    const bar = document.getElementById(`bar-${type}`);
    if (goal) {
      const pct = Math.min((value / goal) * 100, 100);
      bar.style.width = `${pct}%`;
    } else {
      bar.style.width = '0%';
    }
  },

  renderMealList(entries) {
    const container = document.getElementById('meal-list');

    if (entries.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">🍽️</div>
          <p>Noch keine Einträge für diesen Tag.<br>Tippe auf + um etwas hinzuzufügen.</p>
        </div>
      `;
      return;
    }

    // Group by category
    const categories = {
      breakfast: { label: 'Frühstück', emoji: '🌅', entries: [] },
      lunch: { label: 'Mittagessen', emoji: '☀️', entries: [] },
      dinner: { label: 'Abendessen', emoji: '🌙', entries: [] },
      snack: { label: 'Snacks', emoji: '🍿', entries: [] }
    };

    entries.forEach(e => {
      const cat = e.category || 'snack';
      if (categories[cat]) {
        categories[cat].entries.push(e);
      } else {
        categories.snack.entries.push(e);
      }
    });

    let html = '';
    for (const [catKey, cat] of Object.entries(categories)) {
      if (cat.entries.length === 0) continue;

      html += `
        <div class="meals-section">
          <div class="meals-section-title">
            <span class="cat-dot ${catKey}"></span>
            ${cat.emoji} ${cat.label}
          </div>
      `;

      cat.entries.forEach(entry => {
        html += `
          <div class="meal-card" data-id="${entry.id}">
            <div class="meal-card-info">
              <div class="meal-card-name">${this.escapeHtml(entry.name || 'Ohne Name')}</div>
              <div class="meal-card-macros">
                <span><span class="dot" style="background:var(--color-protein)"></span> ${Math.round(entry.protein || 0)}g P</span>
                <span><span class="dot" style="background:var(--color-carbs)"></span> ${Math.round(entry.carbs || 0)}g K</span>
                <span><span class="dot" style="background:var(--color-fat)"></span> ${Math.round(entry.fat || 0)}g F</span>
              </div>
            </div>
            <div class="meal-card-cal">${Math.round(entry.calories || 0)} <small>kcal</small></div>
            <button type="button" class="meal-card-delete" onclick="App.requestDeleteEntry('${entry.id}')" title="Eintrag löschen">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `;
      });

      html += '</div>';
    }

    container.innerHTML = html;
  },

  // =====================
  // Category Selectors
  // =====================
  setupCategorySelectors() {
    // Set up all category selectors and method tabs
    document.addEventListener('click', (e) => {
      // Category buttons
      const catBtn = e.target.closest('.cat-btn');
      if (catBtn) {
        const selector = catBtn.closest('.category-selector');
        selector.querySelectorAll('.cat-btn').forEach(b => b.classList.remove('active'));
        catBtn.classList.add('active');
      }

      // Method tabs
      const methodTab = e.target.closest('.method-tab');
      if (methodTab) {
        const method = methodTab.dataset.method;
        document.querySelectorAll('.method-tab').forEach(t => t.classList.remove('active'));
        methodTab.classList.add('active');

        document.querySelectorAll('.method-panel').forEach(p => p.classList.remove('active'));
        document.getElementById(`method-${method}`).classList.add('active');

        // Stop camera/scanner when switching tabs
        this.resetPhotoCamera();
        BarcodeScanner.stop();
      }
    });
  },

  getSelectedCategory(selectorId) {
    const selector = document.getElementById(selectorId);
    const active = selector.querySelector('.cat-btn.active');
    return active ? active.dataset.cat : 'snack';
  },

  // =====================
  // Manual Entry
  // =====================
  setupManualEntry() {
    document.getElementById('btn-manual-save').addEventListener('click', () => {
      this.saveManualEntry();
    });
  },

  saveManualEntry() {
    const name = document.getElementById('manual-name').value.trim();
    const calories = parseFloat(document.getElementById('manual-calories').value) || 0;
    const protein = parseFloat(document.getElementById('manual-protein').value) || 0;
    const carbs = parseFloat(document.getElementById('manual-carbs').value) || 0;
    const fat = parseFloat(document.getElementById('manual-fat').value) || 0;
    const category = this.getSelectedCategory('manual-category');

    if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
      this.showToast('Bitte gib mindestens einen Wert ein.', 'error');
      return;
    }

    const targetDate = this.getTargetDate();

    Storage.addEntry({
      date: targetDate,
      name: name || 'Manueller Eintrag',
      category,
      calories, protein, carbs, fat,
      source: 'manual'
    });

    this.currentDate = targetDate;
    this.calendarSelectedDate = targetDate;

    // Clear form
    document.getElementById('manual-name').value = '';
    document.getElementById('manual-calories').value = '';
    document.getElementById('manual-protein').value = '';
    document.getElementById('manual-carbs').value = '';
    document.getElementById('manual-fat').value = '';

    this.showToast('✅ Eintrag gespeichert!', 'success');
    this.navigateTo('dashboard');
  },

  // =====================
  // Photo Entry
  // =====================
  photoBusy: false,
  photoData: null,
  photoAttempted: false,
  photoController: null,

  resetPhotoCamera() {
    AIPhoto.stopCamera();
    document.getElementById('photo-actions').style.display = 'none';
    document.getElementById('photo-video').style.display = 'none';
    document.getElementById('photo-placeholder').style.display = 'flex';
    const button = document.getElementById('btn-photo-start');
    button.disabled = this.photoBusy;
    button.textContent = 'Kamera starten';
  },

  setupPhotoEntry() {
    const fileInput = document.getElementById('photo-file-input');
    document.getElementById('btn-photo-gallery').addEventListener('click', () => fileInput.click());
    document.getElementById('btn-photo-start').addEventListener('click', async () => {
      if (this.photoBusy) return;
      const button = document.getElementById('btn-photo-start');
      button.disabled = true;
      const result = await AIPhoto.startCamera(document.getElementById('photo-video'), document.getElementById('photo-canvas'));
      if (this.currentScreen !== 'add' || !document.getElementById('method-photo').classList.contains('active') || document.hidden) {
        this.resetPhotoCamera(); return;
      }
      if (result.success) {
        document.getElementById('photo-placeholder').style.display = 'none';
        document.getElementById('photo-actions').style.display = 'flex';
        document.getElementById('photo-video').style.display = 'block';
        button.textContent = 'Kamera läuft';
      } else { this.resetPhotoCamera(); this.showPhotoError(result.error); }
    });
    document.getElementById('btn-photo-capture').addEventListener('click', () => {
      if (this.photoBusy) return;
      const photo = AIPhoto.capturePhoto();
      if (!photo) return;
      this.resetPhotoCamera();
      this.selectPhoto(photo);
    });
    fileInput.addEventListener('change', async event => {
      const file = event.target.files[0];
      fileInput.value = '';
      if (!file || this.photoBusy) return;
      await this.selectPhoto(file);
    });
    document.getElementById('btn-photo-analyze').addEventListener('click', () => this.analyzePhoto());
    document.getElementById('btn-photo-cancel').addEventListener('click', () => this.photoController?.abort());
    document.getElementById('photo-description').addEventListener('input', () => {
      document.getElementById('photo-results').style.display = 'none';
      document.getElementById('photo-error').hidden = true;
      this.updatePhotoControls();
    });
    document.getElementById('btn-photo-save').addEventListener('click', () => this.saveFromResults('photo'));
  },

  showPhotoError(message) {
    const error = document.getElementById('photo-error');
    error.textContent = message;
    error.hidden = false;
  },

  updatePhotoControls() {
    document.getElementById('btn-photo-gallery').disabled = this.photoBusy;
    document.getElementById('photo-description').disabled = this.photoBusy;
    const analyze = document.getElementById('btn-photo-analyze');
    analyze.disabled = this.photoBusy || !this.photoData;
    analyze.textContent = this.photoAttempted ? 'Erneut analysieren' : 'Foto analysieren';
    document.getElementById('btn-photo-cancel').hidden = !this.photoController;
    document.getElementById('btn-photo-start').disabled = this.photoBusy || !!AIPhoto.stream;
  },

  async selectPhoto(source) {
    if (this.photoBusy) return;
    this.photoBusy = true;
    this.resetPhotoCamera();
    this.photoData = null;
    this.photoAttempted = false;
    this.updatePhotoControls();
    document.getElementById('photo-error').hidden = true;
    document.getElementById('photo-results').style.display = 'none';
    document.getElementById('photo-preview').classList.remove('active');
    const loading = document.getElementById('photo-loading');
    document.getElementById('photo-loading-text').textContent = 'Foto wird vorbereitet…';
    loading.style.display = 'flex';
    try {
      this.photoData = source instanceof Blob ? await AIPhoto.prepareFile(source) : source;
      document.getElementById('photo-preview-img').src = this.photoData.dataUrl;
      document.getElementById('photo-preview').classList.add('active');
    } catch (error) {
      this.showPhotoError(error.message || 'Das Foto konnte nicht verarbeitet werden.');
    } finally {
      this.photoBusy = false;
      loading.style.display = 'none';
      this.updatePhotoControls();
    }
  },

  async analyzePhoto() {
    if (this.photoBusy || !this.photoData) return;
    this.photoBusy = true;
    this.resetPhotoCamera();
    this.photoAttempted = true;
    this.photoController = new AbortController();
    this.updatePhotoControls();
    document.getElementById('photo-error').hidden = true;
    document.getElementById('photo-results').style.display = 'none';
    const loading = document.getElementById('photo-loading');
    const status = document.getElementById('photo-loading-text');
    status.textContent = 'KI analysiert Foto und Beschreibung…';
    loading.style.display = 'flex';
    const description = document.getElementById('photo-description').value.trim();
    try {
      const result = await AIPhoto.analyzePhoto(this.photoData.base64, this.photoData.mimeType, description, {
        signal: this.photoController.signal,
        onProgress: message => { status.textContent = message; }
      });
      if (result.success) this.showPhotoResults(result.data);
      else this.showPhotoError(result.error);
    } catch {
      this.showPhotoError('Die Analyse konnte nicht abgeschlossen werden. Dein Foto bleibt für einen weiteren Versuch erhalten.');
    } finally {
      this.photoBusy = false;
      this.photoController = null;
      loading.style.display = 'none';
      this.updatePhotoControls();
    }
  },

  showPhotoResults(data) {
    const results = document.getElementById('photo-results');
    results.style.display = 'block';

    document.getElementById('photo-result-name').value = data.name || '';
    document.getElementById('photo-result-calories').value = data.calories || '';
    document.getElementById('photo-result-protein').value = data.protein || '';
    document.getElementById('photo-result-carbs').value = data.carbs || '';
    document.getElementById('photo-result-fat').value = data.fat || '';
  },

  // =====================
  // Text Parser
  // =====================
  setupTextParser() {
    document.getElementById('btn-text-ai').addEventListener('click', () => this.analyzeTextWithAI());
    document.getElementById('btn-text-cancel').addEventListener('click', () => this.textController?.abort());
    document.getElementById('text-input').addEventListener('input', () => {
      document.getElementById('text-results').style.display = 'none';
      document.getElementById('text-error').hidden = true;
    });
    document.getElementById('btn-text-analyze').addEventListener('click', () => {
      this.analyzeText();
    });

    document.getElementById('btn-text-save').addEventListener('click', () => {
      this.saveFromResults('text');
    });
  },

  analyzeText() {
    if (this.textBusy) return;
    document.getElementById('text-results').style.display = 'none';
    document.getElementById('text-error').hidden = true;
    const text = document.getElementById('text-input').value;
    const result = TextParser.parse(text);

    if (result.success) {
      this.showTextResults(result.data);
      this.showToast('✅ Werte erkannt!', 'success');
    } else {
      this.showToast(result.error, 'error');
    }
  },

  showTextResults(data, estimated = false) {
    for (const key of ['name', 'calories', 'protein', 'carbs', 'fat']) {
      document.getElementById(`text-result-${key}`).value = data[key] ?? '';
    }
    document.getElementById('text-results-badge').textContent = estimated ? 'KI-Schätzung' : 'Geparst';
    document.getElementById('text-estimate-note').hidden = !estimated;
    document.getElementById('text-results').style.display = 'block';
  },

  async analyzeTextWithAI() {
    if (this.textBusy) return;
    const input = document.getElementById('text-input');
    const error = document.getElementById('text-error');
    const loading = document.getElementById('text-loading');
    const status = document.getElementById('text-loading-message');
    const button = document.getElementById('btn-text-ai');
    const cancel = document.getElementById('btn-text-cancel');
    const description = input.value.trim();
    error.hidden = true;
    document.getElementById('text-results').style.display = 'none';
    if (!description) {
      error.textContent = 'Bitte beschreibe zuerst deine Mahlzeit.';
      error.hidden = false;
      input.focus();
      return;
    }
    this.textBusy = true;
    this.textController = new AbortController();
    input.disabled = button.disabled = document.getElementById('btn-text-analyze').disabled = true;
    cancel.hidden = false;
    status.textContent = 'KI schätzt die Nährwerte deiner Mahlzeit…';
    loading.style.display = 'flex';
    try {
      const result = await AIPhoto.analyzeText(description, {
        signal: this.textController.signal,
        onProgress: message => { status.textContent = message; }
      });
      if (result.success) this.showTextResults(result.data, true);
      else {
        error.textContent = result.error;
        error.hidden = false;
      }
    } catch {
      error.textContent = 'Die Analyse ist fehlgeschlagen. Dein Text bleibt erhalten. Bitte erneut versuchen.';
      error.hidden = false;
    } finally {
      this.textBusy = false;
      this.textController = null;
      input.disabled = button.disabled = document.getElementById('btn-text-analyze').disabled = false;
      button.textContent = 'Erneut analysieren';
      cancel.hidden = true;
      loading.style.display = 'none';
    }
  },

  // =====================
  // Save from Results (Photo / Text)
  // =====================
  saveFromResults(source) {
    const prefix = source === 'photo' ? 'photo' : 'text';
    const name = document.getElementById(`${prefix}-result-name`).value.trim();
    const calories = parseFloat(document.getElementById(`${prefix}-result-calories`).value) || 0;
    const protein = parseFloat(document.getElementById(`${prefix}-result-protein`).value) || 0;
    const carbs = parseFloat(document.getElementById(`${prefix}-result-carbs`).value) || 0;
    const fat = parseFloat(document.getElementById(`${prefix}-result-fat`).value) || 0;
    const category = this.getSelectedCategory(`${prefix}-category`);

    if (calories === 0 && protein === 0 && carbs === 0 && fat === 0) {
      this.showToast('Bitte gib mindestens einen Wert ein.', 'error');
      return;
    }

    const targetDate = this.getTargetDate();

    Storage.addEntry({
      date: targetDate,
      name: name || `${source === 'photo' ? 'Foto' : 'Text'}-Eintrag`,
      category,
      calories, protein, carbs, fat,
      source
    });

    this.currentDate = targetDate;
    this.calendarSelectedDate = targetDate;

    // Reset
    document.getElementById(`${prefix}-results`).style.display = 'none';
    if (source === 'photo') {
      document.getElementById('photo-preview').classList.remove('active');
      document.getElementById('photo-preview-img').removeAttribute('src');
      document.getElementById('photo-description').value = '';
      document.getElementById('photo-error').hidden = true;
      this.photoData = null;
      this.photoAttempted = false;
      this.updatePhotoControls();
    } else {
      document.getElementById('text-input').value = '';
      document.getElementById('btn-text-ai').textContent = 'An KI senden';
      document.getElementById('text-error').hidden = true;
    }

    this.showToast('✅ Eintrag gespeichert!', 'success');
    this.navigateTo('dashboard');
  },

  // =====================
  // Barcode Scanner
  // =====================
  setupBarcodeScanner() {
    const btnStart = document.getElementById('btn-barcode-start');
    const btnStop = document.getElementById('btn-barcode-stop');
    const amountInput = document.getElementById('barcode-amount');

    btnStart.addEventListener('click', async () => {
      const placeholder = document.getElementById('barcode-placeholder');
      placeholder.style.display = 'none';

      // Reset previous results
      document.getElementById('barcode-results').style.display = 'none';
      this.barcodeProductData = null;

      const result = await BarcodeScanner.start('barcode-reader', (event) => {
        this.handleBarcodeResult(event);
      });

      if (result.success) {
        btnStart.classList.add('hidden');
        btnStop.classList.remove('hidden');
      } else {
        placeholder.style.display = 'flex';
        this.showToast(result.error, 'error');
      }
    });

    btnStop.addEventListener('click', async () => {
      await BarcodeScanner.stop();
      btnStop.classList.add('hidden');
      btnStart.classList.remove('hidden');
      document.getElementById('barcode-placeholder').style.display = 'flex';
    });

    // Recalculate on amount change
    amountInput.addEventListener('input', () => {
      this.recalculateBarcode();
    });

    // Save barcode entry
    document.getElementById('btn-barcode-save').addEventListener('click', () => {
      this.saveBarcodeEntry();
    });
  },

  handleBarcodeResult(event) {
    if (event.type === 'scanning') {
      this.showToast(`Barcode erkannt: ${event.barcode}`, 'info');
      document.getElementById('btn-barcode-stop').classList.add('hidden');
      document.getElementById('btn-barcode-start').classList.remove('hidden');
      return;
    }

    // Result
    if (event.success) {
      this.barcodeProductData = event.data;
      this.showBarcodeProduct(event.data);
    } else {
      this.showToast(event.error, 'error');
      document.getElementById('barcode-placeholder').style.display = 'flex';
    }
  },

  showBarcodeProduct(data) {
    const results = document.getElementById('barcode-results');
    results.style.display = 'block';

    // Product info
    document.getElementById('barcode-product-name').textContent = data.name;
    document.getElementById('barcode-product-brand').textContent = data.brand || '';

    const img = document.getElementById('barcode-product-img');
    if (data.imageUrl) {
      img.src = data.imageUrl;
      img.style.display = 'block';
    } else {
      img.style.display = 'none';
    }

    // Per 100g values
    document.getElementById('barcode-cal-100').textContent = data.per100g.calories;
    document.getElementById('barcode-protein-100').textContent = data.per100g.protein;
    document.getElementById('barcode-carbs-100').textContent = data.per100g.carbs;
    document.getElementById('barcode-fat-100').textContent = data.per100g.fat;

    // Calculate for default amount
    document.getElementById('barcode-amount').value = 100;
    this.recalculateBarcode();
  },

  recalculateBarcode() {
    if (!this.barcodeProductData) return;

    const amount = parseFloat(document.getElementById('barcode-amount').value) || 0;
    const calc = BarcodeScanner.calculateForAmount(this.barcodeProductData.per100g, amount);

    document.getElementById('barcode-cal-calc').textContent = calc.calories;
    document.getElementById('barcode-protein-calc').textContent = calc.protein;
    document.getElementById('barcode-carbs-calc').textContent = calc.carbs;
    document.getElementById('barcode-fat-calc').textContent = calc.fat;
  },

  saveBarcodeEntry() {
    if (!this.barcodeProductData) return;

    const amount = parseFloat(document.getElementById('barcode-amount').value) || 0;
    if (amount <= 0) {
      this.showToast('Bitte gib eine Menge ein.', 'error');
      return;
    }

    const calc = BarcodeScanner.calculateForAmount(this.barcodeProductData.per100g, amount);
    const category = this.getSelectedCategory('barcode-category');
    const targetDate = this.getTargetDate();

    Storage.addEntry({
      date: targetDate,
      name: this.barcodeProductData.name,
      category,
      calories: calc.calories,
      protein: calc.protein,
      carbs: calc.carbs,
      fat: calc.fat,
      amount: `${amount}g`,
      source: 'barcode'
    });

    this.currentDate = targetDate;
    this.calendarSelectedDate = targetDate;

    // Reset
    document.getElementById('barcode-results').style.display = 'none';
    document.getElementById('barcode-placeholder').style.display = 'flex';
    this.barcodeProductData = null;

    this.showToast('✅ Eintrag gespeichert!', 'success');
    this.navigateTo('dashboard');
  },

  // =====================
  // Settings
  // =====================
  setupSettings() {
    document.getElementById('btn-save-api-key').addEventListener('click', () => {
      const key = document.getElementById('settings-api-key').value.trim();
      const settings = Storage.getSettings();
      settings.apiKey = key;
      AIPhoto.modelCache = null;
      Storage.saveSettings(settings);
      this.showToast('✅ API Key gespeichert!', 'success');
    });

    document.getElementById('btn-save-goals').addEventListener('click', () => {
      const settings = Storage.getSettings();
      const calVal = document.getElementById('settings-goal-calories').value;
      const proVal = document.getElementById('settings-goal-protein').value;
      const carbVal = document.getElementById('settings-goal-carbs').value;
      const fatVal = document.getElementById('settings-goal-fat').value;

      settings.goals = {
        calories: calVal ? parseFloat(calVal) : null,
        protein: proVal ? parseFloat(proVal) : null,
        carbs: carbVal ? parseFloat(carbVal) : null,
        fat: fatVal ? parseFloat(fatVal) : null
      };
      Storage.saveSettings(settings);
      this.showToast('✅ Tagesziele gespeichert!', 'success');
    });

    document.getElementById('btn-clear-entries').addEventListener('click', () => {
      if (confirm('Alle Einträge wirklich löschen?')) {
        Storage.clearAllEntries();
        this.renderDashboard();
        this.showToast('Alle Einträge gelöscht.', 'info');
      }
    });

    document.getElementById('btn-clear-all').addEventListener('click', () => {
      if (confirm('Wirklich ALLES zurücksetzen? Alle Einträge und Einstellungen werden gelöscht.')) {
        Storage.clearAll();
        Storage.init();
        this.loadSettings();
        this.renderDashboard();
        this.showToast('Alles zurückgesetzt.', 'info');
      }
    });
  },

  loadSettings() {
    const settings = Storage.getSettings();

    document.getElementById('settings-api-key').value = settings.apiKey || '';

    const goals = settings.goals || {};
    document.getElementById('settings-goal-calories').value = goals.calories || '';
    document.getElementById('settings-goal-protein').value = goals.protein || '';
    document.getElementById('settings-goal-carbs').value = goals.carbs || '';
    document.getElementById('settings-goal-fat').value = goals.fat || '';
  },

  // =====================
  // Week Strip (Dashboard)
  // =====================
  setupWeekStrip() {
    // Week strip is updated dynamically in renderDashboard
  },

  renderWeekStrip() {
    const container = document.getElementById('week-strip');
    if (!container) return;

    const curr = new Date(this.currentDate + 'T00:00:00');
    const dayOfWeek = curr.getDay(); // 0 is Sun, 1 is Mon...
    const diffToMon = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const monday = new Date(curr);
    monday.setDate(curr.getDate() + diffToMon);

    const today = Storage.getToday();
    const dayNames = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];

    let html = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = Storage.formatDate(d);
      const dayNum = d.getDate();
      const isActive = dateStr === this.currentDate;
      const isToday = dateStr === today;
      const totals = Storage.getDayTotals(dateStr);
      const hasEntries = totals.calories > 0;

      html += `
        <button type="button" class="week-day-pill ${isActive ? 'active' : ''} ${isToday ? 'is-today' : ''} ${hasEntries ? 'has-entries' : ''}" 
             onclick="App.selectDate('${dateStr}')" 
             title="${Storage.getDisplayDate(dateStr)}: ${Math.round(totals.calories)} kcal">
          <span class="week-day-name">${dayNames[i]}</span>
          <span class="week-day-num">${dayNum}</span>
          <span class="week-day-indicator"></span>
        </button>
      `;
    }

    container.innerHTML = html;
  },

  selectDate(dateStr) {
    this.currentDate = dateStr;
    this.calendarSelectedDate = dateStr;
    this.renderDashboard();
  },

  // =====================
  // Calendar Screen
  // =====================
  setupCalendar() {
    document.getElementById('btn-cal-jump-today')?.addEventListener('click', () => {
      const today = Storage.getToday();
      this.calendarSelectedDate = today;
      const d = new Date(today + 'T00:00:00');
      this.calendarYear = d.getFullYear();
      this.calendarMonth = d.getMonth();
      this.renderCalendar();
    });

    document.getElementById('btn-cal-prev-month')?.addEventListener('click', () => {
      this.changeCalendarMonth(-1);
    });

    document.getElementById('btn-cal-next-month')?.addEventListener('click', () => {
      this.changeCalendarMonth(1);
    });
  },

  changeCalendarMonth(delta) {
    this.calendarMonth += delta;
    if (this.calendarMonth < 0) {
      this.calendarMonth = 11;
      this.calendarYear--;
    } else if (this.calendarMonth > 11) {
      this.calendarMonth = 0;
      this.calendarYear++;
    }
    this.renderCalendar();
  },

  renderCalendar() {
    const titleEl = document.getElementById('calendar-month-title');
    const gridEl = document.getElementById('calendar-grid');
    if (!titleEl || !gridEl) return;

    if (this.calendarYear === null || this.calendarMonth === null) {
      const now = new Date();
      this.calendarYear = now.getFullYear();
      this.calendarMonth = now.getMonth();
    }

    const monthName = Storage.getMonthName(this.calendarMonth);
    titleEl.textContent = `${monthName} ${this.calendarYear}`;

    const today = Storage.getToday();
    const selectedDate = this.calendarSelectedDate || this.currentDate || today;

    // First day of current month
    const firstDay = new Date(this.calendarYear, this.calendarMonth, 1);
    let startDay = firstDay.getDay(); // 0 is Sun, 1 is Mon...
    startDay = startDay === 0 ? 6 : startDay - 1; // convert to 0: Mon ... 6: Sun

    // Total days in current month
    const totalDays = new Date(this.calendarYear, this.calendarMonth + 1, 0).getDate();

    // Previous month total days
    const prevMonthTotalDays = new Date(this.calendarYear, this.calendarMonth, 0).getDate();

    let html = '';

    // Leading padding days from prev month
    for (let i = startDay - 1; i >= 0; i--) {
      const dayNum = prevMonthTotalDays - i;
      const prevDate = new Date(this.calendarYear, this.calendarMonth - 1, dayNum);
      const dateStr = Storage.formatDate(prevDate);
      html += `
        <div class="cal-day-cell other-month" onclick="App.selectCalendarDate('${dateStr}')">
          <span class="cal-num">${dayNum}</span>
        </div>
      `;
    }

    // Days of current month
    for (let day = 1; day <= totalDays; day++) {
      const curDate = new Date(this.calendarYear, this.calendarMonth, day);
      const dateStr = Storage.formatDate(curDate);
      const isToday = dateStr === today;
      const isSelected = dateStr === selectedDate;
      const totals = Storage.getDayTotals(dateStr);
      const hasEntries = totals.calories > 0;

      html += `
        <div class="cal-day-cell ${isToday ? 'is-today' : ''} ${isSelected ? 'is-selected' : ''} ${hasEntries ? 'has-entries' : ''}"
             onclick="App.selectCalendarDate('${dateStr}')">
          <span class="cal-num">${day}</span>
          ${hasEntries ? '<span class="cal-indicator"></span>' : ''}
        </div>
      `;
    }

    // Trailing padding days to complete grid
    const totalRendered = startDay + totalDays;
    const remaining = (7 - (totalRendered % 7)) % 7;
    for (let day = 1; day <= remaining; day++) {
      const nextDate = new Date(this.calendarYear, this.calendarMonth + 1, day);
      const dateStr = Storage.formatDate(nextDate);
      html += `
        <div class="cal-day-cell other-month" onclick="App.selectCalendarDate('${dateStr}')">
          <span class="cal-num">${day}</span>
        </div>
      `;
    }

    gridEl.innerHTML = html;

    // Render selected day details
    this.renderCalendarDayDetail(selectedDate);
  },

  selectCalendarDate(dateStr) {
    this.calendarSelectedDate = dateStr;
    const parts = dateStr.split('-');
    this.calendarYear = parseInt(parts[0], 10);
    this.calendarMonth = parseInt(parts[1], 10) - 1;
    this.renderCalendar();
  },

  renderCalendarDayDetail(dateStr) {
    const detailEl = document.getElementById('calendar-day-detail');
    if (!detailEl) return;

    const totals = Storage.getDayTotals(dateStr);
    const entries = Storage.getEntriesByDate(dateStr);
    const displayDate = Storage.getFormattedFullDate(dateStr);
    const relativeDay = Storage.getDisplayDate(dateStr);

    let mealsHtml = '';
    if (entries.length === 0) {
      mealsHtml = `
        <div class="cal-empty-state">
          Keine Einträge für diesen Tag gespeichert.
        </div>
      `;
    } else {
      mealsHtml = `
        <div class="cal-meals-title">Einträge (${entries.length})</div>
        <div class="cal-meals-list">
      `;
      entries.forEach(entry => {
        mealsHtml += `
          <div class="cal-meal-row">
            <div class="cal-meal-row-info">
              <div class="cal-meal-row-name">${this.escapeHtml(entry.name || 'Ohne Name')}</div>
              <div class="cal-meal-row-sub">${Math.round(entry.protein || 0)}g P · ${Math.round(entry.carbs || 0)}g K · ${Math.round(entry.fat || 0)}g F</div>
            </div>
            <div class="cal-meal-row-cal">${Math.round(entry.calories || 0)} <small style="font-size:0.65rem;font-weight:normal;color:var(--text-tertiary)">kcal</small></div>
            <button type="button" class="cal-meal-row-delete" onclick="App.requestDeleteEntry('${entry.id}')" title="Eintrag löschen">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>
        `;
      });
      mealsHtml += '</div>';
    }

    detailEl.innerHTML = `
      <div class="cal-detail-header">
        <div class="cal-detail-date">${displayDate}</div>
        <span class="cal-detail-status-pill">${relativeDay}</span>
      </div>

      <div class="cal-detail-macros-row">
        <div class="cal-macro-item">
          <div class="cal-macro-val" style="color:var(--color-calories)">${Math.round(totals.calories)}</div>
          <div class="cal-macro-lbl">kcal</div>
        </div>
        <div class="cal-macro-item">
          <div class="cal-macro-val" style="color:var(--color-protein)">${Math.round(totals.protein * 10) / 10}g</div>
          <div class="cal-macro-lbl">Protein</div>
        </div>
        <div class="cal-macro-item">
          <div class="cal-macro-val" style="color:var(--color-carbs)">${Math.round(totals.carbs * 10) / 10}g</div>
          <div class="cal-macro-lbl">Carbs</div>
        </div>
        <div class="cal-macro-item">
          <div class="cal-macro-val" style="color:var(--color-fat)">${Math.round(totals.fat * 10) / 10}g</div>
          <div class="cal-macro-lbl">Fett</div>
        </div>
      </div>

      ${mealsHtml}

      <div class="cal-actions">
        <button type="button" class="btn btn-secondary btn-sm" onclick="App.openDayInDashboard('${dateStr}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"></path></svg>
          Auf Home öffnen
        </button>
        <button type="button" class="btn btn-primary btn-sm" onclick="App.addMealForDate('${dateStr}')">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
          Eintragen
        </button>
      </div>
    `;
  },

  openDayInDashboard(dateStr) {
    this.currentDate = dateStr;
    this.navigateTo('dashboard');
  },

  addMealForDate(dateStr) {
    this.currentDate = dateStr;
    this.navigateTo('add');
    const input = document.getElementById('add-target-date');
    if (input) input.value = dateStr;
  },

  // =====================
  // Target Date Banner (Add Screen)
  // =====================
  setupAddDateBanner() {
    const input = document.getElementById('add-target-date');
    const btnToday = document.getElementById('btn-add-set-today');
    if (input) {
      input.value = this.currentDate || Storage.getToday();
    }
    if (btnToday) {
      btnToday.addEventListener('click', () => {
        const today = Storage.getToday();
        if (input) input.value = today;
      });
    }
  },

  syncAddDateInput() {
    const input = document.getElementById('add-target-date');
    if (input) {
      input.value = this.currentDate || Storage.getToday();
    }
  },

  getTargetDate() {
    const input = document.getElementById('add-target-date');
    return (input && input.value) ? input.value : (this.currentDate || Storage.getToday());
  },

  // =====================
  // Delete Confirmation Modal
  // =====================
  setupDeleteModal() {
    document.getElementById('btn-cancel-delete')?.addEventListener('click', () => {
      this.closeDeleteModal();
    });

    document.getElementById('btn-confirm-delete')?.addEventListener('click', () => {
      this.confirmDeleteEntry();
    });

    document.getElementById('delete-confirm-modal')?.addEventListener('click', (e) => {
      if (e.target.id === 'delete-confirm-modal') {
        this.closeDeleteModal();
      }
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        const modal = document.getElementById('delete-confirm-modal');
        if (modal && modal.classList.contains('active')) {
          this.closeDeleteModal();
        }
      }
    });
  },

  requestDeleteEntry(id) {
    const entry = Storage.getEntryById(id);
    if (!entry) return;

    this.pendingDeleteId = id;

    const nameEl = document.getElementById('confirm-item-name');
    const metaEl = document.getElementById('confirm-item-meta');
    const modalEl = document.getElementById('delete-confirm-modal');

    if (nameEl) nameEl.textContent = entry.name || 'Unbenannter Eintrag';
    if (metaEl) {
      metaEl.textContent = `${Math.round(entry.calories || 0)} kcal · ${Math.round(entry.protein || 0)}g P · ${Math.round(entry.carbs || 0)}g K · ${Math.round(entry.fat || 0)}g F`;
    }

    if (modalEl) {
      modalEl.classList.add('active');
      modalEl.setAttribute('aria-hidden', 'false');
    }
  },

  closeDeleteModal() {
    const modalEl = document.getElementById('delete-confirm-modal');
    if (modalEl) {
      modalEl.classList.remove('active');
      modalEl.setAttribute('aria-hidden', 'true');
    }
    this.pendingDeleteId = null;
  },

  confirmDeleteEntry() {
    if (!this.pendingDeleteId) return;

    const id = this.pendingDeleteId;
    const entry = Storage.getEntryById(id);
    const entryName = entry ? entry.name : 'Eintrag';

    Storage.deleteEntry(id);
    this.closeDeleteModal();

    this.renderDashboard();
    if (this.currentScreen === 'calendar') {
      this.renderCalendar();
    }

    this.showToast(`🗑️ "${entryName}" gelöscht.`, 'info');
  },

  deleteEntry(id) {
    this.requestDeleteEntry(id);
  },

  // =====================
  // Toast Notifications
  // =====================
  showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.classList.add('removing');
      setTimeout(() => toast.remove(), 250);
    }, 3000);
  },

  // =====================
  // Loading Overlay
  // =====================
  showLoading(text = 'Laden...') {
    const overlay = document.getElementById('loading-overlay');
    document.getElementById('loading-text').textContent = text;
    overlay.classList.add('active');
  },

  hideLoading() {
    document.getElementById('loading-overlay').classList.remove('active');
  },

  // =====================
  // Utilities
  // =====================
  escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
};

// ---- Initialize on DOM ready ----
document.addEventListener('DOMContentLoaded', () => {
  App.init();
});
