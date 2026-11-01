// Deterministic nutrition estimates and strict validation; no network or UI dependencies.
const WellnessModel = {
  goals: { build: 'Muskeln aufbauen', lose: 'Fett reduzieren', maintain: 'Gewicht halten', recomp: 'Muskeln aufbauen & Fett reduzieren' },
  activities: { sedentary: 1.2, light: 1.375, moderate: 1.55, high: 1.725, veryHigh: 1.9 },
  metrics: {
    weightKg: { label: 'Gewicht', unit: 'kg', min: 20, max: 500 },
    bodyFatPct: { label: 'Körperfett', unit: '%', min: 0, max: 75 },
    musclePct: { label: 'Muskelanteil laut Gerät', unit: '%', min: 0, max: 100 },
    muscleKg: { label: 'Muskelmasse laut Gerät', unit: 'kg', min: 0, max: 250 },
    bonePct: { label: 'Knochenanteil', unit: '%', min: 0, max: 15 },
    boneKg: { label: 'Knochenmasse', unit: 'kg', min: 0, max: 20 },
    waterPct: { label: 'Körperwasser', unit: '%', min: 0, max: 85 },
    waistCm: { label: 'Taillenumfang', unit: 'cm', min: 30, max: 250 }
  },
  defaults() { return { profile: null, onboarding: 'pending', measurements: [], messages: [], draft: {}, appliedPlan: null }; },
  date(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) &&
      Number.isFinite(Date.parse(value + 'T12:00:00Z')) && new Date(value + 'T12:00:00Z').toISOString().slice(0, 10) === value;
  },
  today() {
    const date = new Date();
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  },
  number(value, min, max, label) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) throw new Error(`${label}: Bitte eine Zahl zwischen ${min} und ${max} eingeben.`);
    return value;
  },
  text(value, max, label) {
    if (typeof value !== 'string' || value.length > max) throw new Error(`${label} ist ungültig oder zu lang.`);
    return value.trim();
  },
  profile(raw) {
    if (!raw || typeof raw !== 'object') throw new Error('Bitte zuerst dein Profil ausfüllen.');
    const profile = {
      age: this.number(raw.age, 1, 110, 'Alter'),
      heightCm: this.number(raw.heightCm, 100, 250, 'Größe'),
      weightKg: this.number(raw.weightKg, 20, 500, 'Gewicht'),
      weightDate: raw.weightDate,
      sex: raw.sex, activity: raw.activity, goal: raw.goal,
      trainingDays: this.number(raw.trainingDays, 0, 7, 'Trainingstage'),
      targetWeightKg: raw.targetWeightKg == null ? null : this.number(raw.targetWeightKg, 20, 500, 'Zielgewicht'),
      goalText: this.text(raw.goalText ?? '', 2000, 'Zielbeschreibung'),
      preferences: this.text(raw.preferences ?? '', 1000, 'Essenswünsche'),
      specialSituation: raw.specialSituation === true
    };
    if (!Number.isInteger(profile.age) || !Number.isInteger(profile.trainingDays) || !this.date(profile.weightDate) || profile.weightDate > this.today() ||
      !['female', 'male', 'unspecified'].includes(profile.sex) || !Object.hasOwn(this.activities, profile.activity) || !Object.hasOwn(this.goals, profile.goal) ||
      typeof raw.specialSituation !== 'boolean') throw new Error('Bitte Alter, Datum, Berechnungsvariante, Aktivität und Ziel prüfen.');
    return profile;
  },
  measurement(raw, { allowMissingDate = false } = {}) {
    if (!raw || typeof raw !== 'object') throw new Error('Ungültige Körpermessung.');
    const row = { date: raw.date ?? null, time: raw.time || null, source: this.text(raw.source ?? 'Manuell', 100, 'Quelle'), notes: this.text(raw.notes ?? '', 1000, 'Notiz') };
    if (!(allowMissingDate && row.date === null) && (!this.date(row.date) || row.date > this.today())) throw new Error('Messdatum fehlt, ist ungültig oder liegt in der Zukunft.');
    if (row.time !== null && (typeof row.time !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(row.time))) throw new Error('Ungültige Messzeit.');
    let count = 0;
    for (const [key, metric] of Object.entries(this.metrics)) {
      row[key] = raw[key] == null ? null : this.number(raw[key], metric.min, metric.max, metric.label);
      if (row[key] !== null) count++;
    }
    if (!count) throw new Error('Bitte mindestens einen Messwert eingeben.');
    if (raw.id !== undefined) {
      if (typeof raw.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(raw.id)) throw new Error('Ungültige Messungs-ID.');
      row.id = raw.id;
    }
    // Percentages can overlap (especially water). Never sum or normalize them.
    return row;
  },
  validateState(raw) {
    if (!raw || typeof raw !== 'object' || !['pending', 'done', 'skipped'].includes(raw.onboarding) || !Array.isArray(raw.measurements) || raw.measurements.length > 10000 || !Array.isArray(raw.messages) || raw.messages.length > 30) throw new Error('Ungültiges Körperprofil in der Sicherung.');
    const measurements = raw.measurements.map(row => this.measurement(row));
    const ids = new Set();
    for (const row of measurements) {
      if (!row.id || ids.has(row.id)) throw new Error('Fehlende oder doppelte Messungs-ID.');
      ids.add(row.id);
    }
    const messages = raw.messages.map(message => {
      if (!message || !['user', 'assistant'].includes(message.role) || typeof message.createdAt !== 'string' || !Number.isFinite(Date.parse(message.createdAt))) throw new Error('Ungültiger Ziel-Dialog.');
      return { role: message.role, text: this.text(message.text, 4000, 'Nachricht'), createdAt: message.createdAt };
    });
    const draft = {};
    if (!raw.draft || typeof raw.draft !== 'object' || Array.isArray(raw.draft)) throw new Error('Ungültiger Profilentwurf.');
    for (const [key, value] of Object.entries(raw.draft)) {
      if (!/^(profile|measure)-[a-zA-Z]+$|^coach-input$/.test(key)) throw new Error('Ungültiges Entwurfsfeld.');
      draft[key] = this.text(value, 4000, 'Entwurf');
    }
    let appliedPlan = null;
    if (raw.appliedPlan != null) {
      if (!raw.appliedPlan || typeof raw.appliedPlan.createdAt !== 'string' || !Number.isFinite(Date.parse(raw.appliedPlan.createdAt))) throw new Error('Ungültiger gespeicherter Plan.');
      appliedPlan = { createdAt: raw.appliedPlan.createdAt, goals: {} };
      for (const key of ['calories', 'protein', 'carbs', 'fat']) appliedPlan.goals[key] = this.number(raw.appliedPlan.goals?.[key], 0, 10000, 'Planziel');
    }
    return { profile: raw.profile == null ? null : this.profile(raw.profile), onboarding: raw.onboarding, measurements, messages, draft, appliedPlan };
  },
  weight(profile, measurements) {
    const latest = measurements.filter(row => row.weightKg != null && row.date >= profile.weightDate)
      .sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || ''))).at(-1);
    return latest ? { value: latest.weightKg, date: latest.date } : { value: profile.weightKg, date: profile.weightDate };
  },
  plan(profile, measurements = []) {
    const p = this.profile(profile);
    const weight = this.weight(p, measurements);
    const bmi = weight.value / (p.heightCm / 100) ** 2;
    let reason = '';
    if (p.age < 18) reason = 'Unter 18 verändert Wachstum den Bedarf. Bitte Ernährungsziele mit einer qualifizierten Fachperson festlegen. Du kannst Mahlzeiten und Messungen weiterhin erfassen.';
    else if (p.specialSituation) reason = 'Bei Schwangerschaft, Stillzeit oder medizinischen Ernährungsanforderungen ist diese allgemeine Schätzung ungeeignet. Bitte Ziele individuell fachlich festlegen lassen.';
    else if (p.age > 78 || bmi < 18.5 || bmi > 40 || (p.targetWeightKg != null && p.targetWeightKg / (p.heightCm / 100) ** 2 < 18.5)) reason = 'Deine Angaben liegen außerhalb des hier verwendeten allgemeinen Zielrechners. Bitte den passenden Bedarf individuell mit einer Ernährungsfachperson festlegen.';
    if (reason) return { eligible: false, reason, weight, bmi };
    const base = 10 * weight.value + 6.25 * p.heightCm - 5 * p.age;
    const bmrLow = base - 161, bmrHigh = base + 5;
    const bmr = p.sex === 'male' ? bmrHigh : p.sex === 'female' ? bmrLow : (bmrLow + bmrHigh) / 2;
    const factor = this.activities[p.activity];
    const maintenance = bmr * factor;
    // Conservative product defaults, not clinically validated prescriptions.
    const adjustment = p.goal === 'build' ? Math.min(200, maintenance * .05) : p.goal === 'lose' ? -Math.min(400, maintenance * .10) : 0;
    const floor = p.sex === 'female' ? 1200 : 1500;
    const calories = Math.round(Math.max(floor, maintenance + adjustment) / 25) * 25;
    if (calories > 5000) return { eligible: false, reason: 'Der geschätzte Bedarf ist ungewöhnlich hoch. Bitte Aktivität prüfen oder den Bedarf fachlich bestimmen lassen.', weight, bmi };
    const protein = Math.round(weight.value * (p.goal === 'maintain' ? 1.6 : 1.8));
    const fat = Math.round(calories * .30 / 9);
    const carbs = Math.round((calories - protein * 4 - fat * 9) / 4);
    if (carbs < 0) return { eligible: false, reason: 'Für diese Angaben lässt sich kein ausgewogener allgemeiner Startplan ableiten.', weight, bmi };
    return { eligible: true, weight, bmi, bmr: Math.round(bmr), maintenance: Math.round(maintenance), factor,
      range: [Math.round((p.sex === 'unspecified' ? bmrLow : bmr) * factor * .9 / 25) * 25, Math.round((p.sex === 'unspecified' ? bmrHigh : bmr) * factor * 1.1 / 25) * 25],
      adjustment: calories - Math.round(maintenance), goals: { calories, protein, fat, carbs }, goal: p.goal };
  },
  inferGoal(text) {
    const value = String(text).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    if (/\b(nicht|kein|keine|keinen|ohne)\b/.test(value)) return null;
    const build = /muskel|aufbau|aufbauen|bulk|starker/.test(value);
    const lose = /abnehm|fett.*(reduzier|verlier|weg|abbau)|definier|abnehmen|cut/.test(value);
    if (/recomp/.test(value) || (build && lose)) return 'recomp';
    if (build) return 'build';
    if (lose) return 'lose';
    if (/halten|erhalt/.test(value)) return 'maintain';
    return null;
  },
  fingerprint(row) { return JSON.stringify([row.date, row.time, ...Object.keys(this.metrics).map(key => row[key] ?? null)]); },
  mergeMeasurements(existing, incoming, idFactory) {
    const result = structuredClone(existing);
    let added = 0, merged = 0, skipped = 0;
    for (const raw of incoming) {
      const row = this.measurement(raw);
      if (result.some(item => this.fingerprint(item) === this.fingerprint(row))) { skipped++; continue; }
      const match = result.find(item => item.date === row.date && item.time === row.time);
      if (match) {
        for (const key of Object.keys(this.metrics)) {
          if (match[key] != null && row[key] != null && Math.abs(match[key] - row[key]) > .0001) throw new Error(`Abweichende Werte am ${row.date}${row.time ? ' um ' + row.time : ''}. Bitte diese Messung im Verlauf bearbeiten oder eine eigene Messzeit angeben.`);
          if (match[key] == null && row[key] != null) match[key] = row[key];
        }
        merged++;
      } else { result.push({ ...row, id: idFactory() }); added++; }
    }
    return { measurements: result, added, merged, skipped };
  },
  trend(measurements, metric = 'weightKg') {
    // Median per day prevents frequent same-day measurements from dominating a trend.
    const daily = new Map();
    for (const row of measurements) if (row[metric] != null) {
      if (!daily.has(row.date)) daily.set(row.date, []);
      daily.get(row.date).push(row[metric]);
    }
    const points = [...daily].sort(([a], [b]) => a.localeCompare(b)).map(([date, values]) => {
      values.sort((a, b) => a - b); const middle = Math.floor(values.length / 2);
      return { date, value: values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2 };
    });
    if (points.length < 2) return { points, weekly: null };
    const end = Date.parse(points.at(-1).date + 'T12:00:00Z');
    const recent = points.filter(point => (end - Date.parse(point.date + 'T12:00:00Z')) / 86400000 <= 21);
    const span = recent.length ? (end - Date.parse(recent[0].date + 'T12:00:00Z')) / 86400000 : 0;
    if (recent.length < 6 || span < 14) return { points, weekly: null };
    const xs = recent.map(point => (Date.parse(point.date + 'T12:00:00Z') - end) / 86400000);
    const meanX = xs.reduce((a, b) => a + b, 0) / xs.length;
    const meanY = recent.reduce((a, b) => a + b.value, 0) / recent.length;
    const denominator = xs.reduce((a, x) => a + (x - meanX) ** 2, 0);
    const slope = recent.reduce((a, point, i) => a + (xs[i] - meanX) * (point.value - meanY), 0) / denominator;
    return { points, weekly: slope * 7 };
  }
};
