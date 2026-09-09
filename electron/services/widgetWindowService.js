const path = require('path');
const { BrowserWindow, powerMonitor, screen } = require('electron');
const {
  getConfig,
  getWidgetConfigById,
  normalizeThemeSettings,
  updateWidgetConfig
} = require('./configService');
const { protectWindowNavigation } = require('../security/windowSecurity');
const { getVisibleWidgetList, getWidgetList, updateWidgetVisible } = require('./widgetService');
const {
  VALID_WINDOW_MODES,
  WINDOW_MODES,
  getWindowMode,
  normalizeWindowMode,
  refreshWindowModes,
  registerWindow,
  setWindowMode,
  stopWindowModeService,
  unregisterWindow
} = require('./windowModeService');

const widgetWindows = new Map();
const DEFAULT_WIDGET_WINDOW_SIZES = {
  clock: { width: 480, height: 320 },
  weather: { width: 320, height: 300 },
  todo: { width: 620, height: 560 },
  notes: { width: 380, height: 500 },
  schedule: { width: 520, height: 560 },
  floatingFolder: { width: 420, height: 420 }
};
const MINIMUM_WIDGET_WINDOW_SIZES = {
  notes: { width: 340, height: 440 }
};
const TODO_LAYOUT_VERSION = 2;
const NOTES_LAYOUT_VERSION = 3;
const CLOCK_LAYOUT_VERSION = 2;
let isAppQuitting = false;
let systemWindowEventsRegistered = false;

function getWidgetConfigKey(widgetId) {
  return String(widgetId);
}

function getWidgetConfig(widgetId) {
  const config = getConfig();

  // 兼容纯数字 key 和 widget-数字 key，方便旧配置继续读取。
  return getWidgetConfigById(widgetId, config);
}

function clampNumber(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeOpacity(opacity) {
  const value = Number(opacity);

  if (!Number.isFinite(value)) {
    return 1;
  }

  return clampNumber(value, 0.3, 1);
}

function getCombinedOpacity(widgetOpacity, appConfig = getConfig()) {
  const safeConfig = normalizeThemeSettings(appConfig);

  // 全局透明度控制整体视觉层级，单个小组件透明度作为独立倍率叠加。
  return normalizeOpacity(normalizeOpacity(widgetOpacity) * safeConfig.globalOpacity);
}

function createThemeScript(config) {
  const safeConfig = normalizeThemeSettings(config);
  const payload = JSON.stringify({
    theme: safeConfig.theme,
    globalOpacity: safeConfig.globalOpacity,
    borderRadius: safeConfig.borderRadius,
    fontSize: safeConfig.fontSize,
    shadow: safeConfig.shadow
  });

  return `
    (() => {
      const config = ${payload};
      const root = document.documentElement;
      document.body.dataset.theme = config.theme;
      root.style.setProperty('--app-font-size', config.fontSize + 'px');
      root.style.setProperty('--surface-radius', config.borderRadius + 'px');
      root.style.setProperty('--surface-opacity', String(config.globalOpacity));
      root.style.setProperty('--surface-shadow', config.shadow ? '0 18px 46px rgba(15, 23, 42, 0.18)' : 'none');
      document.body.classList.toggle('no-shadow', !config.shadow);
    })();
  `;
}

function getDefaultWidgetWindowSize(widgetType) {
  return DEFAULT_WIDGET_WINDOW_SIZES[widgetType] || {
    width: 280,
    height: 170
  };
}

function getMinimumWidgetWindowSize(widgetType) {
  return MINIMUM_WIDGET_WINDOW_SIZES[widgetType] || {
    width: 180,
    height: 120
  };
}

function ensureBoundsInVisibleArea(bounds) {
  const display = screen.getDisplayMatching(bounds) || screen.getPrimaryDisplay();
  const workArea = display.workArea;
  const width = Math.min(bounds.width, workArea.width);
  const height = Math.min(bounds.height, workArea.height);
  const maxX = workArea.x + workArea.width - width;
  const maxY = workArea.y + workArea.height - height;

  // 如果用户之前保存的位置已经超出当前屏幕范围，启动时拉回可见工作区。
  return {
    x: clampNumber(bounds.x, workArea.x, maxX),
    y: clampNumber(bounds.y, workArea.y, maxY),
    width,
    height
  };
}

function getWidgetWindowOptions(widget) {
  let widgetConfig = getWidgetConfig(widget.id);

  // 旧版 pinned=true/false 在首次读取时迁移为明确的三态窗口模式。
  if (!VALID_WINDOW_MODES.has(widgetConfig.windowMode)) {
    const legacyWindowMode = widgetConfig.desktopLayerVersion === 2 && widgetConfig.pinned === false
      ? WINDOW_MODES.NORMAL
      : WINDOW_MODES.DESKTOP;
    updateWidgetConfig(getWidgetConfigKey(widget.id), {
      windowMode: legacyWindowMode,
      pinned: legacyWindowMode === WINDOW_MODES.DESKTOP,
      windowModeVersion: 1
    });
    widgetConfig = getWidgetConfig(widget.id);
  }

  if (widget.type === 'todo' && Number(widgetConfig.todoLayoutVersion) !== TODO_LAYOUT_VERSION) {
    const usesLegacyDefaultSize = Number(widgetConfig.width) === 360
      && Number(widgetConfig.height) === 420;

    updateWidgetConfig(getWidgetConfigKey(widget.id), {
      todoLayoutVersion: TODO_LAYOUT_VERSION,
      ...(usesLegacyDefaultSize ? DEFAULT_WIDGET_WINDOW_SIZES.todo : {})
    });
    widgetConfig = getWidgetConfig(widget.id);
  }

  if (widget.type === 'clock' && Number(widgetConfig.clockLayoutVersion) !== CLOCK_LAYOUT_VERSION) {
    const width = Number(widgetConfig.width);
    const height = Number(widgetConfig.height);
    const usesLegacyDefaultSize = (
      (width === 280 && height === 170)
      || (width === 260 && height === 180)
      || (width === 340 && height === 300)
      || (width === 420 && height === 420)
    );

    updateWidgetConfig(getWidgetConfigKey(widget.id), {
      clockLayoutVersion: CLOCK_LAYOUT_VERSION,
      ...(usesLegacyDefaultSize ? DEFAULT_WIDGET_WINDOW_SIZES.clock : {})
    });
    widgetConfig = getWidgetConfig(widget.id);
  }

  if (widget.type === 'notes' && Number(widgetConfig.notesLayoutVersion) !== NOTES_LAYOUT_VERSION) {
    const width = Number(widgetConfig.width);
    const height = Number(widgetConfig.height);
    const usesLegacyNotesSize = (
      (width === 636 && height === 976)
      || (width === 440 && height === 620)
      || (width === 400 && height === 540)
    );

    updateWidgetConfig(getWidgetConfigKey(widget.id), {
      notesLayoutVersion: NOTES_LAYOUT_VERSION,
      ...(usesLegacyNotesSize ? DEFAULT_WIDGET_WINDOW_SIZES.notes : {})
    });
    widgetConfig = getWidgetConfig(widget.id);
  }

  const defaultSize = getDefaultWidgetWindowSize(widget.type);
  const width = Number(widgetConfig.width) || defaultSize.width;
  const height = Number(widgetConfig.height) || defaultSize.height;
  const primaryWorkArea = screen.getPrimaryDisplay().workArea;
  const hasSavedPosition = Number.isFinite(Number(widgetConfig.x)) && Number.isFinite(Number(widgetConfig.y));
  const x = hasSavedPosition
    ? Number(widgetConfig.x)
    : primaryWorkArea.x + 48 + (Number(widget.id) % 6) * 24;
  const y = hasSavedPosition
    ? Number(widgetConfig.y)
    : primaryWorkArea.y + 48 + (Number(widget.id) % 6) * 24;
  const windowMode = normalizeWindowMode(widgetConfig.windowMode);
  const locked = widgetConfig.locked !== undefined
    ? Boolean(widgetConfig.locked)
    : Boolean(widget.locked);
  const safeBounds = ensureBoundsInVisibleArea({
    x,
    y,
    width,
    height
  });

  return {
    width: safeBounds.width,
    height: safeBounds.height,
    x: safeBounds.x,
    y: safeBounds.y,
    windowMode,
    pinned: windowMode === WINDOW_MODES.DESKTOP,
    locked,
    opacity: normalizeOpacity(widgetConfig.opacity)
  };
}

function saveWidgetLayout(widgetId, partialConfig) {
  // 小组件布局统一保存到 config.json，供下次启动恢复。
  return updateWidgetConfig(getWidgetConfigKey(widgetId), partialConfig);
}

function saveWindowBounds(widgetId, widgetWindow) {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    return;
  }

  const bounds = widgetWindow.getBounds();

  saveWidgetLayout(widgetId, {
    x: bounds.x,
    y: bounds.y,
    width: bounds.width,
    height: bounds.height
  });
}

function applyWidgetRuntimeConfig(widgetId, widgetWindow, nextConfig, appConfig = getConfig(), widgetType = '') {
  if (!widgetWindow || widgetWindow.isDestroyed()) {
    return;
  }

  const widgetOpacity = normalizeOpacity(nextConfig.opacity);
  const isFullyOpaque = widgetOpacity >= 0.999;
  // 控制台将组件调至 100% 时，该组件必须是最终不透明度 1，不能再被全局玻璃透明度降低。
  // 其余档位延续既有的全局主题与单组件透明度叠加规则。
  const opacity = isFullyOpaque || widgetType === 'floatingFolder' || widgetType === 'notes' || widgetType === 'todo'
    ? widgetOpacity
    : getCombinedOpacity(nextConfig.opacity, appConfig);
  const locked = Boolean(nextConfig.locked);
  const requestedMode = normalizeWindowMode(
    nextConfig.windowMode,
    nextConfig.pinned === false ? WINDOW_MODES.NORMAL : WINDOW_MODES.DESKTOP
  );

  widgetWindow.setOpacity(opacity);
  const modeResult = setWindowMode(widgetId, requestedMode);
  widgetWindow.setResizable(!locked);

  if (Number.isFinite(Number(nextConfig.width)) && Number.isFinite(Number(nextConfig.height))) {
    const minimumSize = getMinimumWidgetWindowSize(widgetType);
    const width = clampNumber(Math.round(Number(nextConfig.width)), minimumSize.width, 1200);
    const height = clampNumber(Math.round(Number(nextConfig.height)), minimumSize.height, 1000);

    widgetWindow.setSize(width, height);
  }

  if (typeof widgetWindow.setMovable === 'function') {
    widgetWindow.setMovable(!locked);
  }

  if (!widgetWindow.webContents.isDestroyed()) {
    widgetWindow.webContents.executeJavaScript(
      `
        document.body.classList.toggle('is-locked', ${locked ? 'true' : 'false'});
        document.body.classList.toggle('is-fully-opaque', ${isFullyOpaque ? 'true' : 'false'});
        ${createThemeScript(appConfig)}
      `,
      true
    ).catch(() => {});
  }

  return modeResult;
}

function updateWidgetWindowMetadata(widget) {
  const widgetId = Number(widget?.id);
  const entry = widgetWindows.get(widgetId);

  if (!entry || entry.window.isDestroyed()) {
    return;
  }

  entry.window.setTitle(widget.name);

  if (!entry.window.webContents.isDestroyed()) {
    entry.window.webContents.executeJavaScript(
      `
        document.title = ${JSON.stringify(widget.name)};
        window.dispatchEvent(new CustomEvent('widget-metadata-updated', {
          detail: ${JSON.stringify({ id: widget.id, name: widget.name, type: widget.type })}
        }));
      `,
      true
    ).catch(() => {});
  }
}

function broadcastWidgetEvent(eventName, detail = {}, targetTypes = []) {
  const targetTypeSet = new Set(targetTypes);

  widgetWindows.forEach((entry) => {
    if (!entry.window || entry.window.isDestroyed()) {
      return;
    }

    if (targetTypeSet.size && !targetTypeSet.has(entry.type)) {
      return;
    }

    if (!entry.window.webContents.isDestroyed()) {
      // 使用统一的自定义事件向小组件广播轻量通知，避免每个组件自行轮询数据库。
      entry.window.webContents.executeJavaScript(
        `
          window.dispatchEvent(new CustomEvent(${JSON.stringify(eventName)}, {
            detail: ${JSON.stringify(detail)}
          }));
        `,
        true
      ).catch(() => {});
    }
  });
}

function scheduleLayoutSave(widgetId, entry) {
  if (entry.layoutSaveTimer) {
    clearTimeout(entry.layoutSaveTimer);
  }

  entry.layoutSaveTimer = setTimeout(() => {
    saveWindowBounds(widgetId, entry.window);
    entry.layoutSaveTimer = null;
  }, 250);
}

function createWidgetWindow(widget) {
  const widgetId = Number(widget.id);
  const existingEntry = widgetWindows.get(widgetId);

  if (existingEntry && !existingEntry.window.isDestroyed()) {
    existingEntry.window.show();
    existingEntry.window.focus();
    return existingEntry.window;
  }

  const options = getWidgetWindowOptions(widget);
  const minimumSize = getMinimumWidgetWindowSize(widget.type);
  const windowOptions = {
    width: options.width,
    height: options.height,
    x: options.x,
    y: options.y,
    minWidth: minimumSize.width,
    minHeight: minimumSize.height,
    frame: false,
    transparent: true,
    resizable: !options.locked,
    minimizable: false,
    show: false,
    // Widget windows belong to the desktop experience, not the task switcher.
    // They use normal z-order unless the user explicitly enables pinning.
    skipTaskbar: true,
    alwaysOnTop: false,
    backgroundColor: '#00000000',
    title: widget.name,
    webPreferences: {
      // 复用 preload 中暴露的安全 IPC API，小组件页面仍不能直接访问 Node.js。
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  };

  const widgetWindow = new BrowserWindow(windowOptions);
  protectWindowNavigation(widgetWindow);
  const entry = {
    window: widgetWindow,
    type: widget.type,
    layoutSaveTimer: null,
    skipVisibleUpdateOnClose: false
  };
  const query = new URLSearchParams({
    id: String(widget.id),
    type: widget.type,
    name: widget.name,
    locked: options.locked ? '1' : '0',
    opacity: String(options.opacity)
  });

  widgetWindows.set(widgetId, entry);
  registerWindow(widgetId, widgetWindow);
  const initialModeResult = applyWidgetRuntimeConfig(
    widgetId,
    widgetWindow,
    options,
    getConfig(),
    widget.type
  );
  if (initialModeResult.degraded) {
    options.windowMode = WINDOW_MODES.NORMAL;
    options.pinned = false;
  }
  widgetWindow.webContents.on('context-menu', (event, params) => {
    const point = {
      x: Number(params.x) || 12,
      y: Number(params.y) || 12
    };

    event.preventDefault();

    if (widgetWindow.webContents.isDestroyed()) {
      return;
    }

    // 拖拽区域可能拦截页面右键事件，主进程兜底派发坐标给渲染层显示自定义菜单。
    widgetWindow.webContents.executeJavaScript(
      `
        window.dispatchEvent(new CustomEvent('widget-context-menu-requested', {
          detail: ${JSON.stringify(point)}
        }));
      `,
      true
    ).catch(() => {});
  });
  saveWidgetLayout(widgetId, {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
    opacity: options.opacity,
    windowMode: options.windowMode,
    pinned: options.pinned,
    locked: options.locked
  });
  widgetWindow.loadFile(path.join(__dirname, '..', '..', 'src', 'widget.html'), {
    query: Object.fromEntries(query)
  });
  console.log(`[widget-window] 已创建小组件窗口：id=${widget.id}, type=${widget.type}`);

  widgetWindow.once('ready-to-show', () => {
    widgetWindow.show();
  });

  widgetWindow.on('move', () => {
    scheduleLayoutSave(widgetId, entry);
  });

  widgetWindow.on('resize', () => {
    scheduleLayoutSave(widgetId, entry);
  });

  widgetWindow.on('close', () => {
    saveWindowBounds(widgetId, widgetWindow);
    unregisterWindow(widgetId, widgetWindow);

    if (!entry.skipVisibleUpdateOnClose && !isAppQuitting) {
      // 用户主动关闭小组件窗口时，只把 visible 置为 0，不删除数据库记录。
      updateWidgetVisible(widgetId, false);
    }
  });

  widgetWindow.on('closed', () => {
    if (entry.layoutSaveTimer) {
      clearTimeout(entry.layoutSaveTimer);
    }

    unregisterWindow(widgetId, widgetWindow);

    // 隐藏后立即重新显示时，新窗口可能先于旧窗口的 closed 回调写入 Map。
    // 只清理当前旧实例，避免误删刚创建的新窗口，导致运行时配置无法即时应用。
    if (widgetWindows.get(widgetId) === entry) {
      widgetWindows.delete(widgetId);
    }
  });

  return widgetWindow;
}

function closeWidgetWindow(widgetId, options = {}) {
  const id = Number(widgetId);
  const entry = widgetWindows.get(id);

  if (!entry || entry.window.isDestroyed()) {
    return;
  }

  entry.skipVisibleUpdateOnClose = options.skipVisibleUpdate !== false;
  entry.window.close();
}

function showWidgetSettings(widgetId) {
  const id = Number(widgetId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('小组件 ID 必须是正整数。');
  }

  const widget = getWidgetList().find((item) => Number(item.id) === id);
  if (!widget) {
    throw new Error('小组件不存在或已被删除。');
  }

  updateWidgetVisible(id, true);
  const widgetWindow = createWidgetWindow({
    ...widget,
    visible: 1
  });
  const openSettings = () => {
    if (!widgetWindow || widgetWindow.isDestroyed() || widgetWindow.webContents.isDestroyed()) {
      return;
    }

    widgetWindow.show();
    widgetWindow.focus();
    widgetWindow.webContents.executeJavaScript(
      "window.setTimeout(() => window.dispatchEvent(new CustomEvent('widget-open-settings-requested')), 180);",
      true
    ).catch(() => {});
  };

  if (widgetWindow.webContents.isLoading()) {
    widgetWindow.webContents.once('did-finish-load', openSettings);
  } else {
    openSettings();
  }

  return {
    widgetId: id,
    opened: true
  };
}

function closeWidgetWindowAndWait(widgetId, options = {}) {
  const id = Number(widgetId);
  const entry = widgetWindows.get(id);

  if (!entry || entry.window.isDestroyed()) {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1200);

    entry.window.once('closed', () => {
      clearTimeout(timer);
      resolve();
    });

    entry.skipVisibleUpdateOnClose = options.skipVisibleUpdate !== false;
    saveWindowBounds(id, entry.window);
    entry.window.close();
  });
}

function saveAllWidgetWindowBounds() {
  widgetWindows.forEach((entry, widgetId) => {
    if (!entry.window || entry.window.isDestroyed()) {
      return;
    }

    if (entry.layoutSaveTimer) {
      clearTimeout(entry.layoutSaveTimer);
      entry.layoutSaveTimer = null;
    }

    // 退出或重启小组件前主动保存位置和尺寸，避免最后一次拖动还没来得及落盘。
    saveWindowBounds(widgetId, entry.window);
  });
}

function showAllWidgetWindows() {
  const widgets = getWidgetList();

  widgets.forEach((widget) => {
    // 托盘“显示全部”会把所有组件重新标记为可见，并创建对应桌面窗口。
    updateWidgetVisible(widget.id, true);
    createWidgetWindow({
      ...widget,
      visible: 1
    });
  });

  return {
    shown: widgets.length
  };
}

function hideAllWidgetWindows() {
  const widgets = getWidgetList();

  widgets.forEach((widget) => {
    updateWidgetVisible(widget.id, false);
  });

  Array.from(widgetWindows.keys()).forEach((widgetId) => {
    closeWidgetWindow(widgetId);
  });

  return {
    hidden: widgets.length
  };
}

async function restartVisibleWidgetWindows() {
  const visibleWidgets = getVisibleWidgetList();

  // 重启只针对当前可见的小组件，保留用户在管理中心设置的隐藏状态。
  saveAllWidgetWindowBounds();
  await Promise.all(
    Array.from(widgetWindows.keys()).map((widgetId) => closeWidgetWindowAndWait(widgetId))
  );
  visibleWidgets.forEach((widget) => {
    createWidgetWindow(widget);
  });

  return {
    restarted: visibleWidgets.length
  };
}

function updateWidgetWindowConfig(widgetId, nextConfig = {}) {
  const id = Number(widgetId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('小组件 ID 必须是正整数。');
  }
  if (!nextConfig || typeof nextConfig !== 'object' || Array.isArray(nextConfig)) {
    throw new Error('小组件窗口配置必须是对象。');
  }
  if (nextConfig.windowMode !== undefined && !VALID_WINDOW_MODES.has(nextConfig.windowMode)) {
    throw new Error(`窗口模式无效：${String(nextConfig.windowMode)}`);
  }

  const currentConfig = getWidgetConfig(id);
  const mergedConfig = {
    ...currentConfig,
    ...nextConfig
  };

  if (nextConfig.opacity !== undefined) {
    mergedConfig.opacity = normalizeOpacity(nextConfig.opacity);
  }

  if (nextConfig.pinned !== undefined) {
    mergedConfig.pinned = Boolean(nextConfig.pinned);
    if (nextConfig.windowMode === undefined) {
      // 兼容旧版渲染层；新界面统一直接传 windowMode。
      mergedConfig.windowMode = mergedConfig.pinned
        ? WINDOW_MODES.DESKTOP
        : WINDOW_MODES.NORMAL;
    }
  }

  if (nextConfig.windowMode !== undefined) {
    mergedConfig.windowMode = nextConfig.windowMode;
    mergedConfig.pinned = nextConfig.windowMode === WINDOW_MODES.DESKTOP;
  }

  if (nextConfig.locked !== undefined) {
    mergedConfig.locked = Boolean(nextConfig.locked);
  }

  saveWidgetLayout(id, mergedConfig);

  const entry = widgetWindows.get(id);

  if (entry && !entry.window.isDestroyed()) {
    const modeResult = applyWidgetRuntimeConfig(id, entry.window, mergedConfig, getConfig(), entry.type);
    if (modeResult.degraded) {
      mergedConfig.windowMode = WINDOW_MODES.NORMAL;
      mergedConfig.pinned = false;
      mergedConfig.windowModeError = modeResult.error;
      saveWidgetLayout(id, mergedConfig);
    } else {
      delete mergedConfig.windowModeError;
    }
  }

  return mergedConfig;
}

function setWidgetWindowMode(widgetId, mode) {
  if (!VALID_WINDOW_MODES.has(mode)) {
    throw new Error(`窗口模式无效：${String(mode)}`);
  }

  const config = updateWidgetWindowConfig(widgetId, {
    windowMode: mode
  });
  const runtime = getWindowMode(widgetId);

  return {
    widgetId: Number(widgetId),
    windowMode: config.windowMode,
    runtime
  };
}

function getWidgetWindowMode(widgetId) {
  const id = Number(widgetId);
  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('小组件 ID 必须是正整数。');
  }

  const config = getWidgetConfig(id);
  return {
    widgetId: id,
    windowMode: normalizeWindowMode(config.windowMode),
    runtime: getWindowMode(id)
  };
}

function applyThemeToAllWidgetWindows() {
  const appConfig = getConfig();

  widgetWindows.forEach((entry, widgetId) => {
    if (!entry.window || entry.window.isDestroyed()) {
      return;
    }

    // 保存主题后立即刷新所有已打开的小组件，重启后也会从 config.json 恢复。
    applyWidgetRuntimeConfig(widgetId, entry.window, getWidgetConfig(widgetId), appConfig, entry.type);
  });
}

function restoreVisibleWidgetWindows() {
  // 软件启动时恢复 SQLite 中 visible=1 的小组件独立窗口。
  getVisibleWidgetList().forEach((widget) => {
    createWidgetWindow(widget);
  });
}

function setWidgetWindowsAppQuitting(value) {
  isAppQuitting = Boolean(value);
}

function restoreWindowsToVisibleDisplays() {
  widgetWindows.forEach((entry, widgetId) => {
    if (!entry.window || entry.window.isDestroyed()) return;

    const currentBounds = entry.window.getBounds();
    const visibleBounds = ensureBoundsInVisibleArea(currentBounds);
    if (
      currentBounds.x !== visibleBounds.x
      || currentBounds.y !== visibleBounds.y
      || currentBounds.width !== visibleBounds.width
      || currentBounds.height !== visibleBounds.height
    ) {
      entry.window.setBounds(visibleBounds, false);
      saveWindowBounds(widgetId, entry.window);
    }
  });

  refreshWindowModes();
}

function initializeWidgetWindowEvents() {
  if (systemWindowEventsRegistered) return;
  systemWindowEventsRegistered = true;

  screen.on('display-added', restoreWindowsToVisibleDisplays);
  screen.on('display-removed', restoreWindowsToVisibleDisplays);
  screen.on('display-metrics-changed', restoreWindowsToVisibleDisplays);
  powerMonitor.on('resume', restoreWindowsToVisibleDisplays);
  powerMonitor.on('unlock-screen', restoreWindowsToVisibleDisplays);
}

function stopWidgetWindowEvents() {
  if (systemWindowEventsRegistered) {
    screen.removeListener('display-added', restoreWindowsToVisibleDisplays);
    screen.removeListener('display-removed', restoreWindowsToVisibleDisplays);
    screen.removeListener('display-metrics-changed', restoreWindowsToVisibleDisplays);
    powerMonitor.removeListener('resume', restoreWindowsToVisibleDisplays);
    powerMonitor.removeListener('unlock-screen', restoreWindowsToVisibleDisplays);
    systemWindowEventsRegistered = false;
  }

  stopWindowModeService();
}

module.exports = {
  closeWidgetWindow,
  createWidgetWindow,
  ensureBoundsInVisibleArea,
  getWidgetConfig,
  applyThemeToAllWidgetWindows,
  broadcastWidgetEvent,
  hideAllWidgetWindows,
  getWidgetWindowMode,
  initializeWidgetWindowEvents,
  restoreVisibleWidgetWindows,
  restartVisibleWidgetWindows,
  saveAllWidgetWindowBounds,
  setWidgetWindowsAppQuitting,
  setWidgetWindowMode,
  showWidgetSettings,
  showAllWidgetWindows,
  stopWidgetWindowEvents,
  updateWidgetWindowMetadata,
  updateWidgetWindowConfig
};
