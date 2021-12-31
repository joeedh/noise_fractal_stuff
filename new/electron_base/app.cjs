const { app, BrowserWindow } = require('electron')

function createWindow () {
  // Create the browser window.
  let win = new BrowserWindow({
    width: 1700,
    height: 768,
    webPreferences: {
      nodeIntegration: true,
      sandbox : false,
      enableRemoteModule : true,
      experimentalFeatures: true,
      allowRunningInsecureContent : true
    }
  })

  // and load the index.html of the app.
  win.loadFile('window.html');

  win.webContents.openDevTools();
}

app.whenReady().then(createWindow)
