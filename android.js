// Install prompt and camera lifecycle. No external dependencies.
(() => {
  let installPrompt;
  const button = document.getElementById('btn-install');
  const hint = document.getElementById('install-hint');
  const installed = () => {
    button.hidden = true;
    hint.textContent = 'KCal ist als App geöffnet oder installiert. Deine Einträge bleiben auf diesem Gerät; die Fotoanalyse benötigt Internet.';
  };
  if (matchMedia('(display-mode: standalone)').matches) installed();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
  });
  button.addEventListener('click', async () => {
    if (!installPrompt) return;
    button.disabled = true;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } finally {
      installPrompt = null;
      button.hidden = true;
      button.disabled = false;
    }
  });
  window.addEventListener('appinstalled', installed);
  document.getElementById('btn-quick-add').addEventListener('click', () => App.navigateTo('add'));
  document.getElementById('date-display-trigger').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
  });
  const stopCamera = () => { App.resetPhotoCamera(); BarcodeScanner.stop(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
  window.addEventListener('pagehide', stopCamera);
})();
