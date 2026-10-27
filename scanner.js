// ============================================
// KCal Tracker - Barcode Scanner Module
// Barcode scanning + Open Food Facts API lookup
// ============================================

const BarcodeScanner = {
  scanner: null,
  isScanning: false,

  // Initialize the barcode scanner
  async start(containerId, onResult) {
    if (this.isScanning) {
      await this.stop();
    }

    try {
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
          Html5QrcodeSupportedFormats.UPC_E,
          Html5QrcodeSupportedFormats.CODE_128,
          Html5QrcodeSupportedFormats.CODE_39,
        ]
      };

      await this.scanner.start(
        { facingMode: 'environment' },
        config,
        async (decodedText) => {
          // Barcode detected - stop scanning and look up product
          await this.stop();
          onResult({ type: 'scanning', barcode: decodedText });

          const product = await this.lookupProduct(decodedText);
          onResult({ type: 'result', ...product });
        },
        (errorMessage) => {
          // Scanning in progress, errors are normal here
        }
      );

      return { success: true };

    } catch (err) {
      console.error('Scanner error:', err);
      this.isScanning = false;
      return {
        success: false,
        error: 'Barcode-Scanner konnte nicht gestartet werden. Bitte erlaube den Kamera-Zugriff.'
      };
    }
  },

  // Stop the scanner
  async stop() {
    if (this.scanner && this.isScanning) {
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
    try {
      const response = await fetch(
        `https://world.openfoodfacts.org/api/v0/product/${barcode}.json`
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
