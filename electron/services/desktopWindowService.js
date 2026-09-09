const path = require('path');

let nativeBridge = null;
let nativeLoadError = null;
let nativeLoadLogged = false;
const nativeHandles = new WeakMap();

function createResult(ok, message, errorCode = 0, extra = {}) {
  return {
    ok,
    errorCode,
    message,
    ...extra
  };
}

function loadNativeBridge() {
  if (nativeBridge || nativeLoadError) return nativeBridge;

  if (process.platform !== 'win32') {
    nativeLoadError = new Error('Windows desktop mode is only available on Windows.');
    return null;
  }

  try {
    if (process.env.DWM_FORCE_NATIVE_FAILURE === '1') {
      throw new Error('已按测试要求模拟 Windows 原生层级模块加载失败。');
    }
    const modulePath = path.join(__dirname, '..', '..', 'native', 'windows-desktop-zorder');
    nativeBridge = require(modulePath);
  } catch (error) {
    nativeLoadError = error;

    if (!nativeLoadLogged) {
      nativeLoadLogged = true;
      console.error('[desktop-window] Windows 原生层级模块加载失败，将自动降级为普通窗口：', error);
    }
  }

  return nativeBridge;
}

function getNativeWindowHandle(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) return null;

  const cachedHandle = nativeHandles.get(browserWindow);
  if (cachedHandle) return cachedHandle;

  const buffer = browserWindow.getNativeWindowHandle();
  const handle = buffer.length >= 8
    ? buffer.readBigUInt64LE(0)
    : BigInt(buffer.readUInt32LE(0));

  nativeHandles.set(browserWindow, handle);
  return handle;
}

function getNativeBridgeStatus() {
  if (process.env.DWM_DISABLE_DESKTOP_ATTACHMENT === '1') {
    return {
      available: true,
      disabledForAutomation: true,
      status: {
        desktopHostAvailable: true,
        registeredCount: 0,
        monitorRunning: false
      }
    };
  }

  const bridge = loadNativeBridge();
  if (!bridge) {
    return {
      available: false,
      disabledForAutomation: false,
      error: nativeLoadError?.message || 'Windows 原生层级模块不可用。'
    };
  }

  try {
    const status = bridge.getStatus();
    return {
      available: Boolean(status.desktopHostAvailable),
      disabledForAutomation: false,
      status,
      error: status.desktopHostAvailable ? '' : '未找到 Windows 桌面宿主窗口。'
    };
  } catch (error) {
    return {
      available: false,
      disabledForAutomation: false,
      error: error?.message || String(error)
    };
  }
}

function setWidgetDesktopMode(browserWindow) {
  if (!browserWindow || browserWindow.isDestroyed()) {
    return createResult(false, '小组件窗口已经销毁。', 1400);
  }

  if (process.env.DWM_DISABLE_DESKTOP_ATTACHMENT === '1') {
    return createResult(true, '自动化环境已跳过真实桌面层级调整。', 0, {
      disabledForAutomation: true
    });
  }

  const bridge = loadNativeBridge();
  if (!bridge) {
    return createResult(
      false,
      nativeLoadError?.message || 'Windows 原生层级模块未能加载。',
      126
    );
  }

  const handle = getNativeWindowHandle(browserWindow);
  if (!handle || !bridge.isWindowValid(handle)) {
    return createResult(false, '小组件 HWND 无效。', 1400);
  }

  const result = bridge.setDesktopMode(handle);
  if (result.ok) {
    browserWindow.setSkipTaskbar(true);
  }
  return result;
}

function restoreWidgetWindowMode(browserWindow) {
  if (!browserWindow) return createResult(true, '窗口不存在，无需恢复。');
  if (process.env.DWM_DISABLE_DESKTOP_ATTACHMENT === '1') {
    return createResult(true, '自动化环境已跳过真实桌面层级调整.', 0, {
      disabledForAutomation: true
    });
  }

  const bridge = loadNativeBridge();
  const handle = nativeHandles.get(browserWindow)
    || (!browserWindow.isDestroyed() ? getNativeWindowHandle(browserWindow) : null);

  if (!bridge || !handle) {
    return createResult(true, '原生模块或 HWND 不可用，已按未注册处理。');
  }

  return bridge.restoreNormalMode(handle);
}

function unregisterWidgetWindow(browserWindow) {
  if (!browserWindow) return createResult(true, '窗口不存在，无需注销。');
  if (process.env.DWM_DISABLE_DESKTOP_ATTACHMENT === '1') {
    nativeHandles.delete(browserWindow);
    return createResult(true, '自动化环境已跳过真实 HWND 注销。');
  }

  const bridge = loadNativeBridge();
  const handle = nativeHandles.get(browserWindow);
  nativeHandles.delete(browserWindow);

  if (!bridge || !handle) return createResult(true, 'HWND 未注册。');
  return bridge.unregisterWindow(handle);
}

function refreshDesktopWindowModes() {
  if (process.env.DWM_DISABLE_DESKTOP_ATTACHMENT === '1') {
    return createResult(true, '自动化环境已跳过真实层级刷新。');
  }

  const bridge = loadNativeBridge();
  if (!bridge) {
    return createResult(false, nativeLoadError?.message || 'Windows 原生层级模块未加载。', 126);
  }

  return bridge.refreshDesktopMode();
}

function stopDesktopWindowMonitoring() {
  if (process.env.DWM_DISABLE_DESKTOP_ATTACHMENT === '1') {
    return createResult(true, '自动化环境没有原生监听需要停止。');
  }

  const bridge = loadNativeBridge();
  if (!bridge) return createResult(true, '原生模块未加载。');
  return bridge.stopAll();
}

module.exports = {
  getNativeBridgeStatus,
  getNativeWindowHandle,
  refreshDesktopWindowModes,
  restoreWidgetWindowMode,
  setWidgetDesktopMode,
  stopDesktopWindowMonitoring,
  unregisterWidgetWindow
};
