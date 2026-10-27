// ============================================
// KCal Tracker - AI Photo Module
// Camera capture + Gemini Vision API analysis
// ============================================

const AIPhoto = {
  stream: null,
  videoElement: null,
  canvasElement: null,

  // Initialize camera
  async startCamera(videoEl, canvasEl) {
    this.videoElement = videoEl;
    this.canvasElement = canvasEl;

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
      console.error('Camera error:', err);
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
    if (!this.videoElement || !this.canvasElement) {
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
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [
                { text: prompt },
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64Data
                  }
                }
              ]
            }],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 512
            }
          })
        }
      );

      if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        console.error('Gemini API error:', errData);
        return {
          success: false,
          error: `API Fehler (${response.status}): ${errData?.error?.message || 'Unbekannter Fehler'}`
        };
      }

      const data = await response.json();
      const textResponse = data?.candidates?.[0]?.content?.parts?.[0]?.text;

      if (!textResponse) {
        return { success: false, error: 'Keine Antwort von der KI erhalten.' };
      }

      // Parse JSON from response (handle potential markdown code blocks)
      let jsonStr = textResponse.trim();
      // Remove markdown code block wrappers if present
      jsonStr = jsonStr.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '');
      jsonStr = jsonStr.trim();

      try {
        const result = JSON.parse(jsonStr);
        return {
          success: true,
          data: {
            name: result.name || 'Unbekannt',
            calories: Math.round(parseFloat(result.calories) || 0),
            protein: Math.round(parseFloat(result.protein) || 0),
            carbs: Math.round(parseFloat(result.carbs) || 0),
            fat: Math.round(parseFloat(result.fat) || 0)
          }
        };
      } catch (parseErr) {
        // Try to extract values using TextParser as fallback
        const parsed = TextParser.parse(textResponse);
        if (parsed.success) {
          return parsed;
        }
        return {
          success: false,
          error: 'KI-Antwort konnte nicht gelesen werden. Versuche es erneut.'
        };
      }

    } catch (err) {
      console.error('AI analysis error:', err);
      return {
        success: false,
        error: 'Verbindungsfehler. Prüfe deine Internetverbindung.'
      };
    }
  },

  // Analyze from file input (gallery)
  async analyzeFromFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result;
        const base64 = dataUrl.split(',')[1];
        const mimeType = file.type || 'image/jpeg';
        const result = await this.analyzePhoto(base64, mimeType);
        result.dataUrl = dataUrl;
        resolve(result);
      };
      reader.onerror = () => {
        resolve({ success: false, error: 'Datei konnte nicht gelesen werden.' });
      };
      reader.readAsDataURL(file);
    });
  }
};
