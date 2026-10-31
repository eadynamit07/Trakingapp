// ============================================
// KCal Tracker - Storage Module
// Handles all data persistence via localStorage
// ============================================

const Storage = {
  KEYS: {
    ENTRIES: 'kcaltracker_entries',
    SETTINGS: 'kcaltracker_settings'
  },

  DEFAULT_API_KEY: '',

  // Initialize storage with defaults
  init() {
    return this.getSettings();
  },

  // =====================
  // Settings Management
  // =====================
  getSettings() {
    try {
      const data = localStorage.getItem(this.KEYS.SETTINGS);
      if (data) return JSON.parse(data);
    } catch (e) {
      console.error('Error reading settings:', e);
    }
    return {
      apiKey: '',
      goals: {
        calories: null,
        protein: null,
        carbs: null,
        fat: null
      }
    };
  },

  saveSettings(settings) {
    try {
      localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
    } catch (e) {
      console.error('Error saving settings:', e);
    }
  },

  getApiKey() {
    return this.getSettings().apiKey || '';
  },

  getGoals() {
    return this.getSettings().goals || { calories: null, protein: null, carbs: null, fat: null };
  },

  // =====================
  // Entry Management
  // =====================
  getAllEntries() {
    try {
      const data = localStorage.getItem(this.KEYS.ENTRIES);
      return data ? JSON.parse(data) : [];
    } catch (e) {
      console.error('Error reading entries:', e);
      return [];
    }
  },

  getEntriesByDate(dateStr) {
    return this.getAllEntries().filter(e => e.date === dateStr);
  },

  addEntry(entry) {
    const entries = this.getAllEntries();
    entry.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
    entry.timestamp = new Date().toISOString();
    entries.push(entry);
    try {
      localStorage.setItem(this.KEYS.ENTRIES, JSON.stringify(entries));
    } catch (e) {
      console.error('Error saving entry:', e);
    }
    return entry;
  },

  deleteEntry(id) {
    let entries = this.getAllEntries();
    entries = entries.filter(e => e.id !== id);
    try {
      localStorage.setItem(this.KEYS.ENTRIES, JSON.stringify(entries));
    } catch (e) {
      console.error('Error deleting entry:', e);
    }
  },

  getDayTotals(dateStr) {
    const entries = this.getEntriesByDate(dateStr);
    return entries.reduce((totals, entry) => ({
      calories: totals.calories + (parseFloat(entry.calories) || 0),
      protein: totals.protein + (parseFloat(entry.protein) || 0),
      carbs: totals.carbs + (parseFloat(entry.carbs) || 0),
      fat: totals.fat + (parseFloat(entry.fat) || 0)
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });
  },

  clearAllEntries() {
    localStorage.removeItem(this.KEYS.ENTRIES);
  },

  clearAll() {
    localStorage.removeItem(this.KEYS.ENTRIES);
    localStorage.removeItem(this.KEYS.SETTINGS);
  },

  getEntryById(id) {
    return this.getAllEntries().find(e => e.id === id) || null;
  },

  getDatesWithEntries() {
    const entries = this.getAllEntries();
    const dates = new Set();
    entries.forEach(e => {
      if (e.date) dates.add(e.date);
    });
    return Array.from(dates);
  },

  // =====================
  // Date Helpers
  // =====================
  formatDate(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  },

  getToday() {
    return this.formatDate(new Date());
  },

  getDisplayDate(dateStr) {
    const today = this.getToday();
    const yesterday = this.formatDate(new Date(Date.now() - 86400000));
    const tomorrow = this.formatDate(new Date(Date.now() + 86400000));
    if (dateStr === today) return 'Heute';
    if (dateStr === yesterday) return 'Gestern';
    if (dateStr === tomorrow) return 'Morgen';
    const parts = dateStr.split('-');
    return `${parts[2]}.${parts[1]}.${parts[0]}`;
  },

  getWeekday(dateStr) {
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    const date = new Date(dateStr + 'T00:00:00');
    return days[date.getDay()];
  },

  getFormattedFullDate(dateStr) {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const months = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    const days = ['Sonntag', 'Montag', 'Dienstag', 'Mittwoch', 'Donnerstag', 'Freitag', 'Samstag'];
    return `${days[date.getDay()]}, ${date.getDate()}. ${months[date.getMonth()]} ${date.getFullYear()}`;
  },

  getMonthName(monthIndex) {
    const months = [
      'Januar', 'Februar', 'März', 'April', 'Mai', 'Juni',
      'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember'
    ];
    return months[monthIndex];
  }
};
