// Janela do Electron para os testes (ver launch.mjs). Só abre uma janela vazia; o teste navega.
const { app, BrowserWindow } = require('electron');
// perfil novo por execução: sem cookie/armazenamento de um teste anterior vazando para o próximo
if (process.env.NEXUS_USER_DATA) app.setPath('userData', process.env.NEXUS_USER_DATA);
app.disableHardwareAcceleration();
app.whenReady().then(() => { const w = new BrowserWindow({ width: Number(process.env.NEXUS_W) || 390, height: Number(process.env.NEXUS_H) || 844, show: true, webPreferences: { contextIsolation: true, sandbox: true } }); w.loadURL('about:blank'); });
app.on('window-all-closed', () => app.quit());
