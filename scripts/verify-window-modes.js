const { app, BrowserWindow } = require('electron');
const nativeDesktopZOrder = require('../native/windows-desktop-zorder');
const {
  WINDOW_MODES,
  registerWindow,
  setWindowMode,
  stopWindowModeService,
  unregisterWindow
} = require('../electron/services/windowModeService');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function getHwnd(browserWindow) {
  const handle = browserWindow.getNativeWindowHandle();
  return handle.length >= 8
    ? handle.readBigUInt64LE(0)
    : BigInt(handle.readUInt32LE(0));
}

async function run() {
  await app.whenReady();

  const window = new BrowserWindow({
    width: 280,
    height: 180,
    frame: false,
    transparent: true,
    show: false,
    skipTaskbar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  try {
    await window.loadURL('data:text/html,<main style="font-family:sans-serif">Window mode verification</main>');
    const hwnd = getHwnd(window);

    assert(nativeDesktopZOrder.isWindowValid(hwnd), 'Electron HWND should be valid.');
    registerWindow(1, window);
    const desktopResult = setWindowMode(1, WINDOW_MODES.DESKTOP);
    assert(!desktopResult.degraded, `Desktop mode failed: ${desktopResult.error}`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    const desktopInspection = nativeDesktopZOrder.inspectWindow(hwnd);
    assert(!window.isAlwaysOnTop(), 'Desktop mode must not use alwaysOnTop.');
    assert(nativeDesktopZOrder.getStatus().registeredCount === 1, 'Desktop HWND was not registered.');
    assert(desktopInspection.registered, 'Native inspection did not find the registered HWND.');
    assert(desktopInspection.topLevel, 'Desktop mode must keep the widget as an ownerless top-level window.');
    assert(desktopInspection.aboveDesktopHost, 'Widget was not placed above the Windows desktop host.');
    console.log('[PASS] 时钟技术验证：Node-API 桌面层注册');

    window.minimize();
    await new Promise((resolve) => setTimeout(resolve, 60));
    nativeDesktopZOrder.refreshDesktopMode();
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert(!window.isMinimized() && window.isVisible(), 'Desktop refresh did not recover a minimized widget.');
    window.hide();
    nativeDesktopZOrder.refreshDesktopMode();
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert(window.isVisible(), 'Desktop refresh did not recover a hidden widget.');
    console.log('[PASS] 时钟技术验证：显示桌面后的最小化与隐藏恢复');

    const normalResult = setWindowMode(1, WINDOW_MODES.NORMAL);
    assert(!normalResult.degraded, `Normal mode failed: ${normalResult.error}`);
    assert(nativeDesktopZOrder.getStatus().registeredCount === 0, 'Normal mode did not unregister HWND.');
    console.log('[PASS] 时钟技术验证：恢复普通窗口层级');

    const alwaysOnTopResult = setWindowMode(1, WINDOW_MODES.ALWAYS_ON_TOP);
    assert(!alwaysOnTopResult.degraded, `Always-on-top failed: ${alwaysOnTopResult.error}`);
    await new Promise((resolve) => setTimeout(resolve, 120));
    assert(window.isAlwaysOnTop(), 'Electron alwaysOnTop mode did not activate.');
    setWindowMode(1, WINDOW_MODES.NORMAL);
    console.log('[PASS] 时钟技术验证：Electron 始终置顶切换');

    const invalidResult = nativeDesktopZOrder.setDesktopMode(1n);
    assert(!invalidResult.ok && invalidResult.errorCode, 'Invalid HWND should return an explicit error.');
    console.log('[PASS] 时钟技术验证：无效 HWND 返回可读错误');
  } finally {
    unregisterWindow(1, window);
    stopWindowModeService();
    if (!window.isDestroyed()) window.destroy();
    app.quit();
  }
}

run().catch((error) => {
  console.error('[FAIL] 窗口模式技术验证：', error);
  try {
    stopWindowModeService();
  } catch (stopError) {
    console.error('[FAIL] 停止原生监听失败：', stopError);
  }
  app.exit(1);
});
