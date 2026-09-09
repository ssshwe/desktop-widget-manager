process.env.DWM_FORCE_NATIVE_FAILURE = '1';

const { app, BrowserWindow } = require('electron');
const {
  WINDOW_MODES,
  registerWindow,
  setWindowMode,
  stopWindowModeService,
  unregisterWindow
} = require('../electron/services/windowModeService');

async function run() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 240,
    height: 160,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    registerWindow(1, window);
    const result = setWindowMode(1, WINDOW_MODES.DESKTOP);
    if (!result.degraded || result.appliedMode !== WINDOW_MODES.NORMAL) {
      throw new Error(`原生模块失败后未降级为普通窗口：${JSON.stringify(result)}`);
    }
    if (window.isDestroyed() || window.isAlwaysOnTop()) {
      throw new Error('降级必须保留窗口且不能伪装为始终置顶。');
    }
    console.log('[PASS] 原生模块加载失败时保留窗口并自动降级为 normal');
  } finally {
    unregisterWindow(1, window);
    stopWindowModeService();
    if (!window.isDestroyed()) window.destroy();
    app.quit();
  }
}

run().catch((error) => {
  console.error('[FAIL] 原生模块降级验证：', error);
  app.exit(1);
});
