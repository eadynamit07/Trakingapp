// Install prompt and camera lifecycle. No external dependencies.
(() => {
  let installPrompt;
  const button = document.getElementById('btn-install');
  const hint = document.getElementById('install-hint');
  const downloadDialog = document.getElementById('download-dialog');
  const downloadInstall = document.getElementById('btn-download-install');
  const downloadStatus = document.getElementById('download-install-status');
  document.getElementById('btn-download').addEventListener('click', () => downloadDialog.showModal());
  document.getElementById('btn-download-close').addEventListener('click', () => downloadDialog.close());
  document.getElementById('btn-download-web').addEventListener('click', () => downloadDialog.close());
  const installed = () => {
    installPrompt = null;
    downloadInstall.hidden = true;
    downloadStatus.textContent = 'KCal ist bereits installiert oder als App geöffnet.';
    downloadStatus.hidden = false;
    button.hidden = true;
    hint.textContent = 'KCal ist als App geöffnet oder installiert. Deine Einträge bleiben auf diesem Gerät; die Fotoanalyse benötigt Internet.';
  };
  if (matchMedia('(display-mode: standalone)').matches) installed();
  window.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    button.hidden = false;
    downloadInstall.hidden = false;
    downloadStatus.hidden = true;
  });
  const install = async () => {
    if (!installPrompt) return;
    button.disabled = downloadInstall.disabled = true;
    try {
      await installPrompt.prompt();
      await installPrompt.userChoice;
    } catch {
      downloadStatus.textContent = 'Die Installation konnte nicht geöffnet werden. Nutze die Anleitung für deinen Browser.';
      downloadStatus.hidden = false;
    } finally {
      installPrompt = null;
      button.hidden = true;
      downloadInstall.hidden = true;
      button.disabled = downloadInstall.disabled = false;
    }
  };
  button.addEventListener('click', install);
  downloadInstall.addEventListener('click', install);
  window.addEventListener('appinstalled', installed);
  document.getElementById('btn-quick-add').addEventListener('click', () => App.navigateTo('add'));
  document.getElementById('date-display-trigger').addEventListener('keydown', event => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.currentTarget.click(); }
  });
  const stopCamera = () => { App.resetPhotoCamera(); BarcodeScanner.stop(); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopCamera(); });
  window.addEventListener('pagehide', stopCamera);
})();
