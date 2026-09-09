const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const outputPath = path.join(projectRoot, 'output', 'qa', 'widget-center-implementation.png');

app.commandLine.appendSwitch('disable-gpu');

function waitForLoad(window) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Widget Center capture timed out.')), 10000);

    window.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    window.webContents.once('did-fail-load', (event, code, description) => {
      clearTimeout(timer);
      reject(new Error(`Widget Center capture failed: ${code} ${description}`));
    });
  });
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1672,
    height: 941,
    show: false,
    frame: false,
    backgroundColor: '#f4f7fb',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });
  const loadPromise = waitForLoad(window);

  await window.loadFile(path.join(projectRoot, 'src', 'index.html'), {
    query: {
      'figma-preview': '1'
    }
  });
  await loadPromise;
  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (
          document.querySelectorAll('.widget-row').length === 2
          && document.querySelectorAll('.available-card').length === 6
          && document.querySelector('#api-status')?.textContent === '主进程已连接'
        ) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() - started > 8000) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    })
  `);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, (await window.capturePage()).toPNG());
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
