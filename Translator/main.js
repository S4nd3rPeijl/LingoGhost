const { app, BrowserWindow, globalShortcut, desktopCapturer, session, ipcMain } = require('electron');

let win;

function createWindow() {
  win = new BrowserWindow({
    fullscreen: true,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    hasShadow: false,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  // Standaard klikken negeren voor transparante delen
  win.setIgnoreMouseEvents(true, { forward: true });

  // Luister naar muis-hover berichten uit de renderer
  ipcMain.on('set-ignore-mouse-events', (event, ignore, options) => {
    const window = BrowserWindow.fromWebContents(event.sender);
    if (window) {
      window.setIgnoreMouseEvents(ignore, options);
    }
  });

  // Geef toestemming voor schermopname
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    desktopCapturer.getSources({ types: ['screen', 'window'] }).then((sources) => {
      callback({ video: sources[0] });
    });
  });

  win.loadFile('index.html');
  win.setAlwaysOnTop(true, 'screen-saver');

  // Globale sneltoets (Ctrl+Shift+S)
  globalShortcut.register('CommandOrControl+Shift+S', () => {
    win.webContents.send('trigger-scan');
  });
}

app.whenReady().then(createWindow);

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});