const {
  getNativeBridgeStatus,
  refreshDesktopWindowModes,
  restoreWidgetWindowMode,
  setWidgetDesktopMode,
  stopDesktopWindowMonitoring,
  unregisterWidgetWindow
} = require('./desktopWindowService');

const WINDOW_MODES = Object.freeze({
  DESKTOP: 'desktop',
  NORMAL: 'normal',
  ALWAYS_ON_TOP: 'alwaysOnTop'
});
const VALID_WINDOW_MODES = new Set(Object.values(WINDOW_MODES));
const windowEntries = new Map();

function normalizeWidgetId(widgetId) {
  const id = Number(widgetId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('小组件 ID 必须是正整数。');
  }
  return id;
}

function normalizeWindowMode(mode, fallback = WINDOW_MODES.DESKTOP) {
  return VALID_WINDOW_MODES.has(mode) ? mode : fallback;
}

function assertWindowMode(mode) {
  if (!VALID_WINDOW_MODES.has(mode)) {
    throw new Error(`窗口模式无效：${String(mode)}`);
  }
  return mode;
}

function registerWindow(widgetId, browserWindow) {
  const id = normalizeWidgetId(widgetId);
  if (!browserWindow || browserWindow.isDestroyed()) {
    throw new Error('无法注册已经销毁的小组件窗口。');
  }

  const existing = windowEntries.get(id);
  if (existing?.alwaysOnTopRetryTimer) {
    clearTimeout(existing.alwaysOnTopRetryTimer);
  }

  const entry = {
    browserWindow,
    requestedMode: WINDOW_MODES.NORMAL,
    appliedMode: WINDOW_MODES.NORMAL,
    degraded: false,
    error: '',
    alwaysOnTopRetryTimer: null
  };
  windowEntries.set(id, entry);
  return entry;
}

function getEntry(widgetId) {
  const id = normalizeWidgetId(widgetId);
  const entry = windowEntries.get(id);
  if (!entry || !entry.browserWindow || entry.browserWindow.isDestroyed()) {
    return null;
  }
  return entry;
}

function clearAlwaysOnTopRetry(entry) {
  if (entry?.alwaysOnTopRetryTimer) {
    clearTimeout(entry.alwaysOnTopRetryTimer);
    entry.alwaysOnTopRetryTimer = null;
  }
}

function ensureAlwaysOnTop(entry) {
  const browserWindow = entry.browserWindow;
  if (!browserWindow || browserWindow.isDestroyed()) return;

  // A pending native desktop reorder can arrive just after a mode switch.
  // Verify once after the queue settles; this is bounded and not a poller.
  clearAlwaysOnTopRetry(entry);
  entry.alwaysOnTopRetryTimer = setTimeout(() => {
    entry.alwaysOnTopRetryTimer = null;
    if (
      entry.requestedMode === WINDOW_MODES.ALWAYS_ON_TOP
      && !browserWindow.isDestroyed()
      && !browserWindow.isAlwaysOnTop()
    ) {
      browserWindow.setAlwaysOnTop(true);
    }
  }, 80);
}

function applyWindowMode(widgetId, mode) {
  const id = normalizeWidgetId(widgetId);
  const safeMode = assertWindowMode(mode);
  const entry = getEntry(id);

  if (!entry) {
    return {
      widgetId: id,
      requestedMode: safeMode,
      appliedMode: WINDOW_MODES.NORMAL,
      degraded: true,
      error: '小组件窗口不存在或已经销毁。'
    };
  }

  const browserWindow = entry.browserWindow;
  clearAlwaysOnTopRetry(entry);
  entry.requestedMode = safeMode;
  entry.degraded = false;
  entry.error = '';

  if (safeMode === WINDOW_MODES.DESKTOP) {
    browserWindow.setAlwaysOnTop(false);
    const result = setWidgetDesktopMode(browserWindow);

    if (!result.ok) {
      restoreWidgetWindowMode(browserWindow);
      browserWindow.setAlwaysOnTop(false);
      entry.appliedMode = WINDOW_MODES.NORMAL;
      entry.degraded = true;
      entry.error = result.message || '桌面模式初始化失败。';
      console.error(`[window-mode] widget=${id} 桌面模式不可用，已降级为普通窗口：${entry.error}`);
    } else {
      entry.appliedMode = WINDOW_MODES.DESKTOP;
    }
  } else {
    restoreWidgetWindowMode(browserWindow);
    browserWindow.setAlwaysOnTop(false);

    if (safeMode === WINDOW_MODES.ALWAYS_ON_TOP) {
      browserWindow.setAlwaysOnTop(true);
      ensureAlwaysOnTop(entry);
      entry.appliedMode = WINDOW_MODES.ALWAYS_ON_TOP;
    } else {
      entry.appliedMode = WINDOW_MODES.NORMAL;
    }
  }

  browserWindow.setSkipTaskbar(true);
  return {
    widgetId: id,
    requestedMode: safeMode,
    appliedMode: entry.appliedMode,
    degraded: entry.degraded,
    error: entry.error
  };
}

function setWindowMode(widgetId, mode) {
  return applyWindowMode(widgetId, mode);
}

function getWindowMode(widgetId) {
  const id = normalizeWidgetId(widgetId);
  const entry = getEntry(id);
  if (!entry) return null;

  return {
    widgetId: id,
    requestedMode: entry.requestedMode,
    appliedMode: entry.appliedMode,
    degraded: entry.degraded,
    error: entry.error
  };
}

function unregisterWindow(widgetId, browserWindow = null) {
  const id = normalizeWidgetId(widgetId);
  const entry = windowEntries.get(id);
  if (!entry) {
    if (browserWindow) unregisterWidgetWindow(browserWindow);
    return;
  }

  if (browserWindow && entry.browserWindow !== browserWindow) {
    unregisterWidgetWindow(browserWindow);
    return;
  }

  clearAlwaysOnTopRetry(entry);
  unregisterWidgetWindow(entry.browserWindow);
  windowEntries.delete(id);
}

function refreshWindowModes() {
  const desktopResult = refreshDesktopWindowModes();

  windowEntries.forEach((entry) => {
    if (!entry.browserWindow || entry.browserWindow.isDestroyed()) return;
    if (entry.requestedMode === WINDOW_MODES.ALWAYS_ON_TOP) {
      entry.browserWindow.setAlwaysOnTop(true);
      ensureAlwaysOnTop(entry);
    }
  });

  return desktopResult;
}

function stopWindowModeService() {
  windowEntries.forEach((entry) => clearAlwaysOnTopRetry(entry));
  windowEntries.clear();
  return stopDesktopWindowMonitoring();
}

module.exports = {
  VALID_WINDOW_MODES,
  WINDOW_MODES,
  applyWindowMode,
  getNativeBridgeStatus,
  getWindowMode,
  normalizeWindowMode,
  refreshWindowModes,
  registerWindow,
  setWindowMode,
  stopWindowModeService,
  unregisterWindow
};
