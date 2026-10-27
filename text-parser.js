// ============================================
// KCal Tracker - Text Parser Module
// Extracts nutritional values from pasted text
// (e.g., from Gemini chat responses)
// ============================================

const TextParser = {

  // Main parse function - tries multiple strategies
  parse(text) {
    if (!text || !text.trim()) {
      return { success: false, error: 'Kein Text eingegeben.' };
    }

    // Try JSON parsing first
    let result = this.tryParseJSON(text);
    if (result.success) return result;

    // Try regex-based parsing
    result = this.tryParseRegex(text);
    if (result.success) return result;

    // Try table format
    result = this.tryParseTable(text);
    if (result.success) return result;

    return {
      success: false,
      error: 'Konnte keine Nährwerte im Text finden. Stelle sicher, dass der Text Angaben zu Kalorien, Protein, Kohlenhydraten oder Fett enthält.'
    };
  },

  // ---- Strategy 1: JSON Parsing ----
  tryParseJSON(text) {
    try {
      // Find JSON object in text
      const jsonMatch = text.match(/\{[\s\S]*?\}/);
      if (jsonMatch) {
        const obj = JSON.parse(jsonMatch[0]);
        const result = this.normalizeObject(obj);
        if (this.hasAnyValue(result)) {
          return { success: true, data: result };
        }
      }
    } catch (e) {
      // Not JSON, try other strategies
    }
    return { success: false };
  },

  // ---- Strategy 2: Regex Parsing ----
  tryParseRegex(text) {
    const data = {
      name: this.extractName(text),
      calories: this.extractValue(text, this.patterns.calories),
      protein: this.extractValue(text, this.patterns.protein),
      carbs: this.extractValue(text, this.patterns.carbs),
      fat: this.extractValue(text, this.patterns.fat)
    };

    if (this.hasAnyValue(data)) {
      return { success: true, data };
    }
    return { success: false };
  },

  // ---- Strategy 3: Table Format ----
  tryParseTable(text) {
    const lines = text.split('\n');
    const data = { name: '', calories: null, protein: null, carbs: null, fat: null };

    for (const line of lines) {
      // Match table rows like "| Kalorien | 450 |" or "Kalorien | 450"
      const cells = line.split('|').map(c => c.trim()).filter(c => c);
      if (cells.length >= 2) {
        const label = cells[0].toLowerCase();
        const value = parseFloat(cells[1].replace(/[^\d.,]/g, '').replace(',', '.'));
        if (!isNaN(value)) {
          if (this.matchesAny(label, ['kalorie', 'kcal', 'calorie', 'energie', 'brennwert', 'energy'])) {
            data.calories = value;
          } else if (this.matchesAny(label, ['protein', 'eiweiß', 'eiweiss'])) {
            data.protein = value;
          } else if (this.matchesAny(label, ['kohlenhydrat', 'carb', 'kh'])) {
            data.carbs = value;
          } else if (this.matchesAny(label, ['fett', 'fat'])) {
            data.fat = value;
          }
        }
      }
    }

    if (this.hasAnyValue(data)) {
      return { success: true, data };
    }
    return { success: false };
  },

  // ---- Regex Patterns ----
  patterns: {
    calories: [
      /(?:kalorien|kcal|calories?|energie|brennwert|energy)\s*[:\-=]?\s*(?:ca\.?\s*)?(\d+[\.,]?\d*)\s*(?:kcal|cal)?/i,
      /(\d+[\.,]?\d*)\s*(?:kcal|kalorien|calories)/i,
      /(?:gesamt|total)\s*[:\-]?\s*(\d+[\.,]?\d*)\s*(?:kcal|cal)/i
    ],
    protein: [
      /(?:protein|eiweiß|eiweiss|proteine?)\s*[:\-=]?\s*(?:ca\.?\s*)?(\d+[\.,]?\d*)\s*g?/i,
      /(\d+[\.,]?\d*)\s*g?\s*(?:protein|eiweiß|eiweiss)/i
    ],
    carbs: [
      /(?:kohlenhydrate?|carbs?|carbohydrates?|kh)\s*[:\-=]?\s*(?:ca\.?\s*)?(\d+[\.,]?\d*)\s*g?/i,
      /(\d+[\.,]?\d*)\s*g?\s*(?:kohlenhydrate?|carbs?|kh)/i
    ],
    fat: [
      /(?:fett|fat|fette?)\s*[:\-=]?\s*(?:ca\.?\s*)?(\d+[\.,]?\d*)\s*g?/i,
      /(\d+[\.,]?\d*)\s*g?\s*(?:fett|fat)/i
    ]
  },

  extractValue(text, patterns) {
    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const val = parseFloat(match[1].replace(',', '.'));
        if (!isNaN(val) && val >= 0 && val < 50000) {
          return val;
        }
      }
    }
    return null;
  },

  extractName(text) {
    // Try to find a food name in the text
    const namePatterns = [
      /(?:name|gericht|mahlzeit|lebensmittel|food)\s*[:\-=]\s*(.+)/i,
      /(?:für|for)\s+(?:dein[e]?\s+)?(.+?)(?:\s*[:\-]|\s*$)/i,
      /^(?:\*{1,2})?(.+?)(?:\*{1,2})?\s*$/m
    ];

    for (const pattern of namePatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const name = match[1].trim().replace(/[*_#]/g, '').trim();
        if (name.length > 1 && name.length < 100 && !name.match(/^\d+/)) {
          return name;
        }
      }
    }
    return '';
  },

  // ---- Helpers ----
  normalizeObject(obj) {
    const result = { name: '', calories: null, protein: null, carbs: null, fat: null };
    for (const [key, value] of Object.entries(obj)) {
      const k = key.toLowerCase();
      const v = parseFloat(value);
      if (isNaN(v)) continue;

      if (this.matchesAny(k, ['calorie', 'kcal', 'kalorie', 'energie', 'energy', 'brennwert'])) {
        result.calories = v;
      } else if (this.matchesAny(k, ['protein', 'eiweiß', 'eiweiss'])) {
        result.protein = v;
      } else if (this.matchesAny(k, ['carb', 'kohlenhydrat', 'kh'])) {
        result.carbs = v;
      } else if (this.matchesAny(k, ['fat', 'fett'])) {
        result.fat = v;
      }
    }
    if (typeof obj.name === 'string') result.name = obj.name;
    if (typeof obj.Name === 'string') result.name = obj.Name;
    return result;
  },

  matchesAny(str, keywords) {
    return keywords.some(kw => str.includes(kw));
  },

  hasAnyValue(data) {
    return data.calories !== null || data.protein !== null || data.carbs !== null || data.fat !== null;
  }
};
