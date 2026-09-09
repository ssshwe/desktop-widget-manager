const path = require('path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');

app.commandLine.appendSwitch('disable-gpu');

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 1180,
    height: 720,
    show: false,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false
    }
  });

  await window.loadFile(path.join(projectRoot, 'src', 'index.html'), {
    query: { 'figma-preview': '1' }
  });

  await window.webContents.executeJavaScript(`
    new Promise((resolve) => {
      const started = Date.now();
      const timer = setInterval(() => {
        if (document.querySelectorAll('.available-card').length === 6 || Date.now() - started > 5000) {
          clearInterval(timer);
          resolve();
        }
      }, 50);
    })
  `);

  const before = await window.webContents.executeJavaScript(`(() => {
    const content = document.querySelector('.content-shell');
    const bounds = content.getBoundingClientRect();
    return {
      overflowY: getComputedStyle(content).overflowY,
      clientHeight: content.clientHeight,
      scrollHeight: content.scrollHeight,
      scrollTop: content.scrollTop,
      x: Math.round(bounds.left + bounds.width / 2),
      y: Math.round(bounds.top + bounds.height / 2)
    };
  })()`);

  if (before.overflowY !== 'auto' || before.scrollHeight <= before.clientHeight) {
    throw new Error(`Small-window content is not scrollable: ${JSON.stringify(before)}`);
  }

  window.webContents.debugger.attach('1.3');
  await window.webContents.debugger.sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseWheel',
    x: before.x,
    y: before.y,
    deltaX: 0,
    deltaY: 480
  });
  await delay(300);
  window.webContents.debugger.detach();

  const afterScrollTop = await window.webContents.executeJavaScript(
    `document.querySelector('.content-shell').scrollTop`
  );

  if (afterScrollTop <= before.scrollTop) {
    throw new Error(`Mouse wheel did not scroll the content: ${before.scrollTop} -> ${afterScrollTop}`);
  }

  console.log(JSON.stringify({
    passed: true,
    overflowY: before.overflowY,
    clientHeight: before.clientHeight,
    scrollHeight: before.scrollHeight,
    scrollTopAfterWheel: afterScrollTop
  }));

  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
