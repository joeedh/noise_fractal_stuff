'use strict'

const {app, BrowserWindow, session} = require('electron')
const path = require('path')

const appDir = path.resolve(__dirname, '..', 'app')

// SharedArrayBuffer requires cross-origin isolation headers even on file:// in Electron
app.commandLine.appendSwitch('enable-features', 'SharedArrayBuffer')

function createWindow() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Cross-Origin-Opener-Policy': ['same-origin'],
        'Cross-Origin-Embedder-Policy': ['require-corp'],
      },
    })
  })

  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: false,
      nodeIntegration: false,
    },
  })

  win.loadFile(path.join(appDir, 'index.html'))
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow()
})
