// ============================================
// KCal Tracker - Barcode Scanner Module
// Barcode scanning + Open Food Facts API lookup
// ============================================

const BarcodeScanner = {
  scanner: null,
  isScanning: false,
  generation: 0,
  starting: false,

  // Initialize the barcode scanner
  async start(containerId, onResult) {
    if (this.starting) return { success: false, error: 'Die Kamera wird bereits gestartet. Bitte kurz warten.' };
    this.starting = true;
    if (this.isScanning) {
      await this.stop();
    }

    const generation = ++this.generation;
    let detected = false;
    try {
      if (typeof Html5Qrcode === 'undefined') return { success: false, error: 'Scanner nicht geladen. Prüfe deine Internetverbindung und lade die App neu.' };
      // Create scanner instance
      this.scanner = new Html5Qrcode(containerId);
      this.isScanning = true;

      const config = {
        fps: 10,
        qrbox: { width: 280, height: 150 },
        aspectRatio: 1.777,
        formatsToSupport: [
          Html5QrcodeSupportedFormats.EAN_13,
          Html5QrcodeSupportedFormats.EAN_8,
          Html5QrcodeSupportedFormats.UPC_A,
        ]
      };

      await this.scanner.start(
        { facingMode: 'environment' },
        config,
        async (decodedText) => {
          if (detected || generation !== this.generation) return;
          detected = true;
          // Barcode detected - stop scanning and look up product
          await this.stop();
          const lookupGeneration = this.generation;
          onResult({ type: 'scanning', barcode: decodedText });

          const product = await this.lookupProduct(decodedText);
          if (lookupGeneration !== this.generation) return;
          onResult({ type: 'result', ...product });
        },
        (errorMessage) => {
          // Scanning in progress, errors are normal here
        }
      );

      if (generation !== this.generation || document.hidden) {
        await this.stop();
        return { success: false, error: 'Kamera wurde geschlossen.' };
      }

      return { success: true };

    } catch (err) {
      await this.stop();
      console.error('Scanner error:', err);
      this.isScanning = false;
      return {
        success: false,
        error: 'Barcode-Scanner konnte nicht gestartet werden. Bitte erlaube den Kamera-Zugriff.'
      };
    } finally { this.starting = false; }
  },

  // Stop the scanner
  async stop() {
    this.generation++;
    if (this.scanner) {
      try {
        await this.scanner.stop();
      } catch (e) {
        // Scanner might already be stopped
      }
      try {
        this.scanner.clear();
      } catch (e) {
        // Container might already be cleared
      }
      this.isScanning = false;
    }
  },

  // Look up product in Open Food Facts API
  async lookupProduct(barcode) {
    barcode = String(barcode).trim();
    if (!/^\d{8}$|^\d{12,14}$/.test(barcode) || !this.validChecksum(barcode)) {
      return { success: false, barcode, error: 'Ungültiger Barcode. Bitte einen EAN-8, EAN-13, UPC-A oder GTIN-14 Lebensmittelcode scannen.' };
    }
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${encodeURIComponent(barcode)}.json`,
        { signal: AbortSignal.timeout(15000) }
      );

      if (!response.ok) {
        return {
          success: false,
          barcode,
          error: `API Fehler (${response.status})`
        };
      }

      const data = await response.json();

      if (data.status !== 1 || !data.product) {
        return {
          success: false,
          barcode,
          error: 'Produkt nicht in der Datenbank gefunden. Du kannst die Werte manuell eingeben.'
        };
      }

      const product = data.product;
      const nutriments = product.nutriments || {};

      return {
        success: true,
        barcode,
        data: {
          name: product.product_name || product.product_name_de || 'Unbekanntes Produkt',
          brand: product.brands || '',
          imageUrl: product.image_front_small_url || product.image_url || '',
          servingSize: product.serving_size || '',
          // Values per 100g
          per100g: {
            calories: Math.round(nutriments['energy-kcal_100g'] || nutriments['energy_100g'] / 4.184 || 0),
            protein: Math.round((nutriments.proteins_100g || 0) * 10) / 10,
            carbs: Math.round((nutriments.carbohydrates_100g || 0) * 10) / 10,
            fat: Math.round((nutriments.fat_100g || 0) * 10) / 10
          },
          // Values per serving (if available)
          perServing: nutriments['energy-kcal_serving'] ? {
            calories: Math.round(nutriments['energy-kcal_serving'] || 0),
            protein: Math.round((nutriments.proteins_serving || 0) * 10) / 10,
            carbs: Math.round((nutriments.carbohydrates_serving || 0) * 10) / 10,
            fat: Math.round((nutriments.fat_serving || 0) * 10) / 10
          } : null
        }
      };
    } catch (err) {
      console.error('Product lookup error:', err);
      return {
        success: false,
        barcode,
        error: 'Verbindungsfehler. Prüfe deine Internetverbindung.'
      };
    }
  },

  // Calculate nutritional values for a specific amount
  validChecksum(barcode) {
    const digits = [...barcode].map(Number);
    const check = digits.pop();
    const sum = digits.reverse().reduce((total, value, i) => total + value * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - sum % 10) % 10 === check;
  },

  calculateForAmount(per100g, amountGrams) {
    const factor = amountGrams / 100;
    return {
      calories: Math.round(per100g.calories * factor),
      protein: Math.round(per100g.protein * factor * 10) / 10,
      carbs: Math.round(per100g.carbs * factor * 10) / 10,
      fat: Math.round(per100g.fat * factor * 10) / 10
    };
  }
};
