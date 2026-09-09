const path = require('path');
const { app, BrowserWindow, Menu, Tray, nativeImage, dialog, ipcMain, screen, session } = require('electron');
const { closeDatabase, initializeDatabase } = require('./db/database');
const { getConfig } = require('./services/configService');
const { removeDashboardWidgets } = require('./services/widgetService');
const { syncAutoStartWithConfig } = require('./services/autoStartService');
const {
  closeWidgetWindow,
  applyThemeToAllWidgetWindows,
  broadcastWidgetEvent,
  createWidgetWindow,
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
} = require('./services/widgetWindowService');
const { registerConfigIpc } = require('./ipc/configIpc');
const { registerDesktopFileIpc } = require('./ipc/desktopFileIpc');
const { registerFileIpc } = require('./ipc/fileIpc');
const { registerNoteIpc } = require('./ipc/noteIpc');
const { registerScheduleIpc } = require('./ipc/scheduleIpc');
const { registerTodoIpc } = require('./ipc/todoIpc');
const { registerWeatherIpc } = require('./ipc/weatherIpc');
const { registerWidgetIpc } = require('./ipc/widgetIpc');
const {
  startScheduleReminderChecker,
  stopScheduleReminderChecker
} = require('./services/scheduleReminderService');
const { initializeLogging, logRendererDiagnostic } = require('./services/logService');
const { isTrustedLocalUrl, protectWindowNavigation } = require('./security/windowSecurity');

let mainWindow = null;
let tray = null;
let isAppQuitting = false;
const hasSingleInstanceLock = app.requestSingleInstanceLock();

const FALLBACK_TRAY_ICON_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAYAAABzenr0AAAAd0lEQVR4nGNgIABUk1//pwQTMp8mlpLtGFpZTJRD6GU5TkcMqAPobTmGI0a2AwbKcrgjiFGEDLCJ4RIfdQBNHUANtZSGwCVkPOqAkeeAAU+EI9cBpIBRB1DNAbTEA98gGXXAoGiWDwoHDHjXjB4OIWgxLRxDyHwAQrG2EGujYFIAAAAASUVORK5CYII=';

ipcMain.on('manager-window-control', (event, action) => {
  if (!isTrustedLocalUrl(event.senderFrame?.url || event.sender?.getURL?.())) {
    return;
  }

  const window = BrowserWindow.fromWebContents(event.sender);

  if (!window || window.isDestroyed()) {
    return;
  }

  if (action === 'minimize') {
    window.minimize();
    return;
  }

  if (action === 'toggle-maximize') {
    if (window.isMaximized()) {
      window.unmaximize();
    } else {
      window.maximize();
    }
    return;
  }

  if (action === 'close') {
    window.close();
  }
});

function markAppQuitting() {
  isAppQuitting = true;
  // 应用整体退出时不把可见小组件改成隐藏，便于下次启动恢复。
  setWidgetWindowsAppQuitting(true);
}

function saveCurrentStateBeforeQuit() {
  // 退出前主动保存配置和所有小组件窗口位置，避免最后一次调整没有落盘。
  saveAllWidgetWindowBounds();
  getConfig();
}

function createFallbackTrayIcon() {
  return nativeImage
    .createFromBuffer(Buffer.from(FALLBACK_TRAY_ICON_BASE64, 'base64'))
    .resize({
      width: 16,
      height: 16
    });
}

async function createTrayIcon() {
  try {
    const fileIcon = await app.getFileIcon(process.execPath, {
      size: 'normal'
    });

    if (fileIcon && !fileIcon.isEmpty()) {
      return fileIcon.resize({
        width: 16,
        height: 16
      });
    }
  } catch (error) {
    console.warn('[tray] 无法读取应用图标，改用内置托盘图标：', error);
  }

  return createFallbackTrayIcon();
}

function showMainWindow() {
  if (!mainWindow || mainWindow.isDestroyed()) {
    createMainWindow();
  }

  if (mainWindow.isMinimized()) {
    mainWindow.restore();
  }

  mainWindow.show();
  mainWindow.focus();
}

function quitApplication() {
  markAppQuitting();
  saveCurrentStateBeforeQuit();
  app.quit();
}

async function runTrayAction(actionName, action) {
  try {
    await Promise.resolve(action());
    refreshTrayMenu();
  } catch (error) {
    console.error(`[tray] ${actionName}失败：`, error);
    dialog.showErrorBox(`${actionName}失败`, error?.message || '托盘操作执行失败，请稍后重试。');
  }
}

function refreshTrayMenu() {
  if (!tray || tray.isDestroyed()) {
    return;
  }

  const contextMenu = Menu.buildFromTemplate([
    {
      label: '打开管理中心',
      click: showMainWindow
    },
    {
      type: 'separator'
    },
    {
      label: '显示全部小组件',
      click: () => runTrayAction('显示全部小组件', showAllWidgetWindows)
    },
    {
      label: '隐藏全部小组件',
      click: () => runTrayAction('隐藏全部小组件', hideAllWidgetWindows)
    },
    {
      label: '重启小组件',
      click: () => runTrayAction('重启小组件', restartVisibleWidgetWindows)
    },
    {
      type: 'separator'
    },
    {
      label: '退出软件',
      click: quitApplication
    }
  ]);

  tray.setContextMenu(contextMenu);
}

async function createAppTray() {
  if (tray && !tray.isDestroyed()) {
    refreshTrayMenu();
    return tray;
  }

  // 托盘常驻，管理中心隐藏后用户仍可从这里管理所有小组件。
  tray = new Tray(await createTrayIcon());
  tray.setToolTip('桌面小组件管理工具');
  tray.on('click', showMainWindow);
  tray.on('double-click', showMainWindow);
  refreshTrayMenu();

  return tray;
}

function registerIpcHandlers() {
  // 主进程统一注册 IPC，后续模块扩展时从这里接入。
  registerConfigIpc({
    applyThemeToAllWidgetWindows
  });
  registerDesktopFileIpc();
  registerWidgetIpc({
    closeWidgetWindow,
    createWidgetWindow,
    getWidgetWindowMode,
    setWidgetWindowMode,
    showWidgetSettings,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  });
  registerTodoIpc();
  registerScheduleIpc();
  registerNoteIpc({
    broadcastWidgetEvent
  });
  registerWeatherIpc();
  registerFileIpc();
}

function registerRendererDiagnostics() {
  ipcMain.on('renderer-diagnostic', (event, payload) => {
    if (!isTrustedLocalUrl(event.senderFrame?.url || event.sender?.getURL?.())) {
      return;
    }

    logRendererDiagnostic(payload);
  });
}

function isTrustedLocalPage(webContents) {
  const pageUrl = webContents?.getURL?.() || '';

  return isTrustedLocalUrl(pageUrl);
}

function configureLocationPermission() {
  // 仅允许本应用自己的本地页面在用户点击“定位”后读取位置；任何远程页面一律拒绝。
  const appSession = session.defaultSession;

  appSession.setPermissionCheckHandler((webContents, permission) => (
    permission === 'geolocation' && isTrustedLocalPage(webContents)
  ));
  appSession.setPermissionRequestHandler((webContents, permission, callback) => {
    callback(permission === 'geolocation' && isTrustedLocalPage(webContents));
  });
}

function createMainWindow() {
  // 创建应用主窗口，作为后续小组件管理中心的入口。
  const appConfig = getConfig();
  const managerConfig = appConfig.managerWindow || {};
  const workArea = screen.getPrimaryDisplay().workAreaSize;
  const minWidth = Math.min(900, workArea.width);
  const minHeight = Math.min(640, workArea.height);
  const width = Math.min(Math.max(Number(managerConfig.width) || 1200, minWidth), workArea.width);
  const height = Math.min(Math.max(Number(managerConfig.height) || 760, minHeight), workArea.height);

  mainWindow = new BrowserWindow({
    width,
    height,
    minWidth,
    minHeight,
    center: true,
    frame: false,
    title: '桌面小组件管理工具',
    backgroundColor: '#f4f7fb',
    webPreferences: {
      // 使用预加载脚本暴露安全 API，避免渲染进程直接访问 Node.js。
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });
  protectWindowNavigation(mainWindow);

  // 加载渲染进程页面，页面文件统一放在 src 目录中。
  mainWindow.loadFile(path.join(__dirname, '..', 'src', 'index.html'));

  mainWindow.on('minimize', (event) => {
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('close', (event) => {
    if (isAppQuitting) {
      return;
    }

    // 点击关闭只隐藏到系统托盘，只有托盘菜单“退出软件”才真正结束进程。
    event.preventDefault();
    mainWindow.hide();
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

if (!hasSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (app.isReady()) {
      showMainWindow();
    } else {
      app.once('ready', showMainWindow);
    }
  });

  app.whenReady().then(async () => {
  let databaseReady = false;

  initializeLogging();
  configureLocationPermission();

  try {
    // 数据库初始化失败时不直接退出应用，后续 IPC 会返回友好提示。
    await initializeDatabase();
    const dashboardCleanup = removeDashboardWidgets();
    if (dashboardCleanup.deletedCount) {
      console.log(`[startup] 已移除 ${dashboardCleanup.deletedCount} 个已废弃的数据看板小组件。`);
    }
    databaseReady = true;
  } catch (error) {
    console.error('[startup] SQLite 数据库初始化失败，应用将以受限模式启动：', error);
  }

  try {
    getConfig();
  } catch (error) {
    console.error('[startup] 配置文件读取失败，应用将使用默认配置继续启动：', error);
  }

  try {
    syncAutoStartWithConfig();
  } catch (error) {
    console.error('[startup] 同步开机自启动设置失败：', error);
  }

  try {
    registerIpcHandlers();
    registerRendererDiagnostics();
    initializeWidgetWindowEvents();
    createMainWindow();
    await createAppTray();
  } catch (error) {
    console.error('[startup] 管理中心或托盘初始化失败：', error);
    app.quit();
    return;
  }

  if (databaseReady) {
    try {
      restoreVisibleWidgetWindows();
      startScheduleReminderChecker();
    } catch (error) {
      console.error('[startup] 恢复小组件或启动提醒检查失败：', error);
    }
  }

  app.on('activate', () => {
    // macOS 点击 Dock 或 Windows 重新激活时，恢复管理中心窗口。
    showMainWindow();
  });
  });

  app.on('window-all-closed', () => {
  // 托盘模式下关闭窗口不退出；只有显式退出时才允许 Electron 结束应用。
  if (isAppQuitting && process.platform !== 'darwin') {
    app.quit();
  }
  });

  app.on('before-quit', () => {
  markAppQuitting();
  saveCurrentStateBeforeQuit();
  stopWidgetWindowEvents();
  stopScheduleReminderChecker();

  if (tray && !tray.isDestroyed()) {
    tray.destroy();
    tray = null;
  }

  // 应用退出前关闭数据库连接，sql.js 会导出并保存 SQLite 文件。
  closeDatabase();
  });

  app.on('will-quit', () => {
  markAppQuitting();
  });

  process.on('SIGINT', () => {
  markAppQuitting();
  app.quit();
  });

  process.on('SIGTERM', () => {
  markAppQuitting();
  app.quit();
  });

  process.on('uncaughtException', (error) => {
  // 顶层兜底：记录未捕获异常，避免问题静默发生，功能级错误应尽量在各服务内处理。
  console.error('[process] 未捕获异常：', error);
  });

  process.on('unhandledRejection', (reason) => {
  console.error('[process] 未处理 Promise 拒绝：', reason);
  });
}
