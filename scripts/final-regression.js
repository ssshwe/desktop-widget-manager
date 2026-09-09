if (!process.argv.includes('--native')) {
  process.env.DWM_DISABLE_DESKTOP_ATTACHMENT = '1';
}

const fs = require('fs');
const path = require('path');
const {
  app,
  BrowserWindow,
  dialog,
  screen,
  shell
} = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output', 'qa', 'final-regression');
const userDataPath = path.join(outputRoot, 'user-data');
const fixturePath = path.join(outputRoot, 'folder-fixture');
const externalFixturePath = path.join(outputRoot, 'external-drag-fixture.txt');
const shortcutFixturePath = path.join(outputRoot, 'electron-shortcut.lnk');
const reportJsonPath = path.join(outputRoot, 'report.json');
const reportMarkdownPath = path.join(outputRoot, 'report.md');
const widgetTypes = ['clock', 'weather', 'todo', 'notes', 'schedule', 'floatingFolder'];
const results = [];
const rendererErrors = [];
const openedPaths = [];
let mainWindow = null;
let exitCode = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function isPathInside(parentPath, childPath) {
  const parent = `${path.resolve(parentPath)}${path.sep}`.toLowerCase();
  const child = path.resolve(childPath).toLowerCase();

  return child.startsWith(parent);
}

function prepareOutputDirectory() {
  assert(isPathInside(projectRoot, outputRoot), '回归输出目录必须位于项目目录内。');
  fs.rmSync(outputRoot, {
    recursive: true,
    force: true
  });
  fs.mkdirSync(userDataPath, {
    recursive: true
  });
  fs.mkdirSync(fixturePath, {
    recursive: true
  });
  fs.writeFileSync(path.join(fixturePath, 'alpha.txt'), 'alpha', 'utf8');
  fs.writeFileSync(path.join(fixturePath, 'beta.md'), '# beta\n', 'utf8');
  fs.mkdirSync(path.join(fixturePath, 'nested'));
  fs.writeFileSync(externalFixturePath, '外部拖入文件', 'utf8');
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check, message, timeout = 5000, interval = 50) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    try {
      if (await check()) {
        return;
      }
    } catch (error) {
      // 页面刷新或窗口切换期间允许短暂失败，超时后统一报告。
    }

    await wait(interval);
  }

  throw new Error(message);
}

function waitForLoad(browserWindow) {
  if (!browserWindow.webContents.isLoading()) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('页面加载超时。')), 6000);

    browserWindow.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    browserWindow.webContents.once('did-fail-load', (event, code, description, url, isMainFrame) => {
      if (!isMainFrame) {
        return;
      }

      clearTimeout(timer);
      reject(new Error(`页面加载失败：${code} ${description}`));
    });
  });
}

function attachRendererDiagnostics(browserWindow, label) {
  browserWindow.webContents.on('console-message', (event, detailsOrLevel, message) => {
    const details = typeof detailsOrLevel === 'object'
      ? detailsOrLevel
      : {
        level: detailsOrLevel,
        message
      };

    if (Number(details.level) >= 2) {
      rendererErrors.push({
        window: label,
        message: details.message || ''
      });
    }
  });

  browserWindow.webContents.on('render-process-gone', (event, details) => {
    rendererErrors.push({
      window: label,
      message: `渲染进程退出：${details.reason}`
    });
  });
}

function getWidgetWindow(widgetId) {
  return BrowserWindow.getAllWindows().find((browserWindow) => {
    const windowUrl = browserWindow.webContents.getURL();

    if (!windowUrl.includes('widget.html')) {
      return false;
    }

    try {
      return Number(new URL(windowUrl).searchParams.get('id')) === Number(widgetId);
    } catch (error) {
      return false;
    }
  }) || null;
}

async function waitForWidgetWindow(widgetId) {
  let widgetWindow = null;

  await waitFor(() => {
    widgetWindow = getWidgetWindow(widgetId);
    return Boolean(widgetWindow && !widgetWindow.isDestroyed());
  }, `小组件窗口 ${widgetId} 未创建。`);

  await waitForLoad(widgetWindow);
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "Boolean(document.querySelector('.video-scene'))"
    ),
    `小组件窗口 ${widgetId} 未完成渲染。`
  );
  widgetWindow.setSkipTaskbar(true);
  widgetWindow.hide();

  return widgetWindow;
}

async function runTest(name, action) {
  const startedAt = Date.now();

  try {
    await action();
    results.push({
      name,
      status: 'passed',
      durationMs: Date.now() - startedAt
    });
    console.log(`[PASS] ${name}`);
  } catch (error) {
    results.push({
      name,
      status: 'failed',
      durationMs: Date.now() - startedAt,
      error: error?.stack || String(error)
    });
    exitCode = 1;
    console.error(`[FAIL] ${name}:`, error);
  }
}

function formatLocalDateTime(date) {
  const pad = (value) => String(value).padStart(2, '0');

  return [
    date.getFullYear(),
    '-',
    pad(date.getMonth() + 1),
    '-',
    pad(date.getDate()),
    'T',
    pad(date.getHours()),
    ':',
    pad(date.getMinutes())
  ].join('');
}

function getTodayDateTime(hours, minutes) {
  const date = new Date();

  date.setHours(hours, minutes, 0, 0);

  return formatLocalDateTime(date);
}

function writeReports() {
  const passed = results.filter((item) => item.status === 'passed');
  const failed = results.filter((item) => item.status === 'failed');
  const payload = {
    generatedAt: new Date().toISOString(),
    summary: {
      total: results.length,
      passed: passed.length,
      failed: failed.length,
      rendererErrors: rendererErrors.length
    },
    results,
    rendererErrors,
    openedPaths
  };
  const markdownLines = [
    '# 最终功能回归',
    '',
    `- 总计：${results.length}`,
    `- 通过：${passed.length}`,
    `- 失败：${failed.length}`,
    `- 渲染进程错误：${rendererErrors.length}`,
    '',
    '## 测试项',
    '',
    ...results.map((item) => (
      `- ${item.status === 'passed' ? '[x]' : '[ ]'} ${item.name}`
      + (item.error ? `\n  - ${item.error.split('\n')[0]}` : '')
    )),
    '',
    '## 受控系统调用',
    '',
    ...openedPaths.map((openedPath) => `- ${openedPath}`),
    ''
  ];

  fs.writeFileSync(reportJsonPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  fs.writeFileSync(reportMarkdownPath, markdownLines.join('\n'), 'utf8');
}

async function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1000,
    height: 700,
    show: false,
    title: '桌面小组件管理工具 - 回归测试',
    webPreferences: {
      preload: path.join(projectRoot, 'electron', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false
    }
  });
  attachRendererDiagnostics(mainWindow, 'manager');
  const loadPromise = waitForLoad(mainWindow);

  await mainWindow.loadFile(path.join(projectRoot, 'src', 'index.html'));
  await loadPromise;
  await waitFor(
    () => mainWindow.webContents.executeJavaScript(
      "Boolean(document.querySelector('#available-widget-grid [data-add-widget-type]'))"
    ),
    '管理端未完成初始化。'
  );
}

async function registerApplicationIpc() {
  const {
    applyThemeToAllWidgetWindows,
    broadcastWidgetEvent,
    closeWidgetWindow,
    createWidgetWindow,
    getWidgetWindowMode,
    initializeWidgetWindowEvents,
    setWidgetWindowMode,
    showWidgetSettings,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  } = require('../electron/services/widgetWindowService');
  const { registerConfigIpc } = require('../electron/ipc/configIpc');
  const { registerDesktopFileIpc } = require('../electron/ipc/desktopFileIpc');
  const { registerFileIpc } = require('../electron/ipc/fileIpc');
  const { registerNoteIpc } = require('../electron/ipc/noteIpc');
  const { registerScheduleIpc } = require('../electron/ipc/scheduleIpc');
  const { registerTodoIpc } = require('../electron/ipc/todoIpc');
  const { registerWeatherIpc } = require('../electron/ipc/weatherIpc');
  const { registerWidgetIpc } = require('../electron/ipc/widgetIpc');

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
  initializeWidgetWindowEvents();
}

async function runRegression() {
  prepareOutputDirectory();
  app.setPath('userData', userDataPath);
  app.commandLine.appendSwitch('disable-gpu');

  await app.whenReady();

  const database = require('../electron/db/database');
  const widgetService = require('../electron/services/widgetService');
  const configService = require('../electron/services/configService');
  const noteService = require('../electron/services/noteService');
  const floatingFolderService = require('../electron/services/floatingFolderService');
  const {
    getLogFilePath,
    initializeLogging,
    logRendererDiagnostic
  } = require('../electron/services/logService');

  const logFilePath = initializeLogging();

  await runTest('日志：持久化主进程和渲染层诊断', async () => {
    const marker = `regression-renderer-log-${Date.now()}`;
    logRendererDiagnostic({
      source: 'regression',
      level: 'error',
      message: marker,
      stack: 'test stack'
    });

    assert(logFilePath === getLogFilePath(), '日志文件路径不稳定。');
    assert(fs.existsSync(logFilePath), '未创建持久化日志文件。');
    assert(fs.readFileSync(logFilePath, 'utf8').includes(marker), '渲染层诊断未写入日志文件。');
  });

  await database.initializeDatabase();

  await runTest('数据看板迁移：删除旧实例及其配置', async () => {
    const db = database.getDatabase();
    db.run(
      `
        INSERT INTO widgets (name, type, visible, pinned, locked, created_at, updated_at)
        VALUES (?, 'dashboard', 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
      `,
      ['旧数据看板']
    );
    const legacyWidgetId = Number(db.exec('SELECT last_insert_rowid() AS id;')[0].values[0][0]);
    database.persistDatabase();
    configService.updateWidgetConfig(String(legacyWidgetId), { opacity: 0.6 });
    configService.updateWidgetConfig(`widget-${legacyWidgetId}`, { legacy: true });

    const cleanup = widgetService.removeDashboardWidgets();

    assert(cleanup.deletedCount === 1, '未删除旧数据看板实例。');
    assert(cleanup.removedConfigCount === 2, '未删除旧数据看板配置。');
    assert(!widgetService.getWidgetById(legacyWidgetId), '旧数据看板实例仍存在。');
    assert(
      !configService.getWidgetConfigById(legacyWidgetId).opacity,
      '旧数据看板配置仍可读取。'
    );
  });

  dialog.showOpenDialog = async () => ({
    canceled: false,
    filePaths: [
      path.join(fixturePath, 'alpha.txt'),
      path.join(fixturePath, 'beta.md'),
      path.join(fixturePath, 'nested')
    ]
  });
  shell.openPath = async (targetPath) => {
    openedPaths.push(targetPath);
    return '';
  };

  await registerApplicationIpc();
  await createMainWindow();

  const widgetsByType = new Map();
  const windowsByType = new Map();

  await runTest('管理端：创建六种小组件', async () => {
    for (const type of widgetTypes) {
      await mainWindow.webContents.executeJavaScript(
        `document.querySelector('[data-add-widget-type="${type}"]').click()`
      );
      await waitFor(
        async () => {
          const widgets = await mainWindow.webContents.executeJavaScript('window.api.getWidgetList()');
          return widgets.some((widget) => widget.type === type);
        },
        `管理端未创建 ${type} 小组件。`
      );
    }

    const widgets = await mainWindow.webContents.executeJavaScript('window.api.getWidgetList()');

    assert(widgets.length === widgetTypes.length, `预期 7 个小组件，实际 ${widgets.length} 个。`);
    widgetTypes.forEach((type) => {
      const widget = widgets.find((item) => item.type === type);

      assert(widget, `缺少 ${type} 小组件。`);
      widgetsByType.set(type, widget);
    });

    for (const type of widgetTypes) {
      const widgetWindow = await waitForWidgetWindow(widgetsByType.get(type).id);

      attachRendererDiagnostics(widgetWindow, type);
      windowsByType.set(type, widgetWindow);
    }
  });

  await runTest('Schedule：IPC 已注册且可新增、读取、删除日程', async () => {
    const startTime = new Date(Date.now() + 60 * 60 * 1000);
    const localStartTime = [
      startTime.getFullYear(),
      String(startTime.getMonth() + 1).padStart(2, '0'),
      String(startTime.getDate()).padStart(2, '0')
    ].join('-') + `T${String(startTime.getHours()).padStart(2, '0')}:${String(startTime.getMinutes()).padStart(2, '0')}`;
    const schedule = await mainWindow.webContents.executeJavaScript(
      `window.api.createSchedule(${JSON.stringify({
        title: '日程回归测试',
        content: '验证主进程 IPC 接线。',
        startTime: localStartTime,
        remindTime: localStartTime
      })})`
    );

    assert(Number.isInteger(Number(schedule?.id)), '日程未能创建。');
    const schedules = await mainWindow.webContents.executeJavaScript('window.api.getScheduleList()');
    assert(schedules.some((item) => Number(item.id) === Number(schedule.id)), '新建日程未能读取。');
    const deleted = await mainWindow.webContents.executeJavaScript(`window.api.deleteSchedule(${Number(schedule.id)})`);
    assert(deleted?.success !== false, '日程未能删除。');
  });

  await runTest('桌面层：默认不置顶且不作为普通窗口最小化', async () => {
    for (const type of widgetTypes) {
      const widgetWindow = windowsByType.get(type);

      assert(widgetWindow && !widgetWindow.isDestroyed(), `${type} 小组件窗口不存在。`);
      assert(!widgetWindow.isAlwaysOnTop(), `${type} 小组件不应默认置顶。`);
      assert(!widgetWindow.isMinimizable(), `${type} 小组件应保持在桌面层。`);
    }
  });

  await runTest('FloatingFolder：Windows 快捷方式读取真实目标图标', async () => {
    const created = shell.writeShortcutLink(shortcutFixturePath, {
      target: process.execPath,
      cwd: path.dirname(process.execPath),
      description: '悬浮收纳区快捷方式图标回归',
      icon: process.execPath,
      iconIndex: 0
    });

    assert(created && fs.existsSync(shortcutFixturePath), '测试快捷方式创建失败。');
    const [shortcutItem] = await floatingFolderService.resolveFloatingFolderFiles([shortcutFixturePath]);
    const targetIcon = await app.getFileIcon(process.execPath, { size: 'large' });

    assert(shortcutItem?.shortcutTarget, '未解析出 .lnk 的真实目标。');
    assert(
      path.resolve(shortcutItem.shortcutTarget).toLowerCase() === path.resolve(process.execPath).toLowerCase(),
      `快捷方式目标不正确：${shortcutItem.shortcutTarget}`
    );
    assert(
      shortcutItem.iconDataUrl === targetIcon.toDataURL(),
      '快捷方式未优先使用真实目标程序图标。'
    );
  });

  await runTest('管理端：显示与隐藏小组件', async () => {
    const widget = widgetsByType.get('clock');

    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('[data-toggle-widget-id="${widget.id}"]').click()`
    );
    await waitFor(
      () => !getWidgetWindow(widget.id),
      '隐藏时钟后窗口仍然存在。'
    );
    assert(widgetService.getWidgetById(widget.id).visible === 0, '隐藏状态未写入数据库。');

    await waitFor(
      () => mainWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-toggle-widget-id="${widget.id}"][data-next-visible="1"]'))`
      ),
      '管理端未刷新为“显示”操作。'
    );
    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('[data-toggle-widget-id="${widget.id}"]').click()`
    );
    const clockWindow = await waitForWidgetWindow(widget.id);

    attachRendererDiagnostics(clockWindow, 'clock-restored');
    windowsByType.set('clock', clockWindow);
    assert(widgetService.getWidgetById(widget.id).visible === 1, '显示状态未写入数据库。');
    await waitFor(
      () => mainWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-toggle-widget-id="${widget.id}"][data-next-visible="0"]'))`
      ),
      '管理端未完成显示状态重绘。'
    );
  });

  await runTest('管理端：调整单组件透明度', async () => {
    const widget = widgetsByType.get('clock');
    const clockWindow = windowsByType.get('clock');

    await mainWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[data-opacity-widget-id="${widget.id}"]');
        input.value = '0.65';
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await waitFor(
      async () => {
        const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
        return Number(config.widgets[String(widget.id)]?.opacity) === 0.65;
      },
      '透明度未保存到配置。'
    );
    assert(
      Math.abs(clockWindow.getOpacity() - (0.65 * 0.92)) < 0.03,
      `窗口透明度未生效：${clockWindow.getOpacity()}`
    );
  });

  await runTest('管理端：三种显示层级与锁定开关', async () => {
    const widget = widgetsByType.get('clock');
    const clockWindow = windowsByType.get('clock');

    clockWindow.show();
    await waitFor(() => clockWindow.isVisible(), '固定桌面测试窗口未显示。');
    await waitFor(
      () => mainWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-window-mode-widget-id="${widget.id}"]'))`
      ),
      '管理端显示层级选择器未就绪。'
    );
    await mainWindow.webContents.executeJavaScript(
      `(() => { const select = document.querySelector('[data-window-mode-widget-id="${widget.id}"]'); select.value = 'normal'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`
    );
    await waitFor(
      async () => {
        const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
        return config.widgets[String(widget.id)]?.windowMode === 'normal';
      },
      '普通窗口模式未保存到配置。'
    );
    await mainWindow.webContents.executeJavaScript(
      `(() => { const select = document.querySelector('[data-window-mode-widget-id="${widget.id}"]'); select.value = 'alwaysOnTop'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`
    );
    await waitFor(
      async () => {
        const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
        return config.widgets[String(widget.id)]?.windowMode === 'alwaysOnTop' && clockWindow.isAlwaysOnTop();
      },
      '始终置顶模式未立即生效或保存。'
    );
    await mainWindow.webContents.executeJavaScript(
      `(() => { const select = document.querySelector('[data-window-mode-widget-id="${widget.id}"]'); select.value = 'desktop'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`
    );
    await waitFor(async () => {
      const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
      return config.widgets[String(widget.id)]?.windowMode === 'desktop' && !clockWindow.isAlwaysOnTop();
    }, '固定桌面模式未立即生效或保存。');
    assert(!clockWindow.isAlwaysOnTop(), '固定桌面不应将窗口设为屏幕置顶。');

    await waitFor(
      () => mainWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-toggle-locked-widget-id="${widget.id}"][data-next-locked="1"]'))`
      ),
      '管理端锁定按钮未就绪。'
    );
    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('[data-toggle-locked-widget-id="${widget.id}"]').click()`
    );
    await waitFor(
      () => !clockWindow.isResizable() && !clockWindow.isMovable(),
      '锁定后窗口仍可移动或缩放。'
    );
    await waitFor(
      () => mainWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-toggle-locked-widget-id="${widget.id}"][data-next-locked="0"]'))`
      ),
      '管理端未刷新锁定状态。'
    );
    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('[data-toggle-locked-widget-id="${widget.id}"]').click()`
    );
    await waitFor(
      () => clockWindow.isResizable() && clockWindow.isMovable(),
      '解锁后窗口未恢复移动和缩放。'
    );
    clockWindow.hide();
  });

  await runTest('管理端：打开快速便签设置', async () => {
    const widget = widgetsByType.get('notes');
    let notesWindow = windowsByType.get('notes');

    await mainWindow.webContents.executeJavaScript(
      `document.querySelector('[data-reserved-action="settings"][data-widget-id="${widget.id}"]').click()`
    );
    notesWindow = await waitForWidgetWindow(widget.id);
    windowsByType.set('notes', notesWindow);
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "Boolean(document.querySelector('#widget-settings-popover'))"
      ),
      '管理端设置按钮未打开小组件设置。'
    );
    assert(
      notesWindow.getSize()[0] === 380 && notesWindow.getSize()[1] === 500,
      `快速便签默认尺寸不正确：${notesWindow.getSize().join('×')}`
    );

    const noteSizes = {
      compact: [340, 440],
      comfortable: [380, 500],
      large: [480, 660]
    };
    for (const [preset, expectedSize] of Object.entries(noteSizes)) {
      await notesWindow.webContents.executeJavaScript(
        `document.querySelector('[data-settings-size="${preset}"]').click()`
      );
      await waitFor(
        () => notesWindow.getSize()[0] === expectedSize[0] && notesWindow.getSize()[1] === expectedSize[1],
        `快速便签 ${preset} 尺寸未应用。`
      );
    }
    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('[data-settings-size=\"comfortable\"]').click()"
    );
    await waitFor(
      () => notesWindow.getSize()[0] === 380 && notesWindow.getSize()[1] === 500,
      '快速便签未恢复标准尺寸。'
    );
    notesWindow.hide();
  });

  await runTest('六类组件：独立模式持久化与窗口重建恢复', async () => {
    const requestedModes = new Map([
      ['clock', 'desktop'],
      ['weather', 'normal'],
      ['todo', 'desktop'],
      ['notes', 'normal'],
      ['schedule', 'desktop'],
      ['floatingFolder', 'alwaysOnTop']
    ]);

    for (const type of widgetTypes) {
      const widget = widgetsByType.get(type);
      await mainWindow.webContents.executeJavaScript(
        `window.api.setWidgetWindowMode(${widget.id}, ${JSON.stringify(requestedModes.get(type))})`
      );
    }

    const savedConfig = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
    widgetTypes.forEach((type) => {
      const widget = widgetsByType.get(type);
      assert(
        savedConfig.widgets[String(widget.id)]?.windowMode === requestedModes.get(type),
        `${type} 未保存独立窗口模式。`
      );
    });

    for (const type of widgetTypes) {
      const widget = widgetsByType.get(type);
      await mainWindow.webContents.executeJavaScript(
        `window.api.updateWidgetVisible(${widget.id}, false)`
      );
      await waitFor(() => !getWidgetWindow(widget.id), `${type} 旧窗口未关闭。`);
      await mainWindow.webContents.executeJavaScript(
        `window.api.updateWidgetVisible(${widget.id}, true)`
      );
      const recreatedWindow = await waitForWidgetWindow(widget.id);
      windowsByType.set(type, recreatedWindow);
      assert(
        recreatedWindow.isAlwaysOnTop() === (requestedModes.get(type) === 'alwaysOnTop'),
        `${type} 窗口重建后模式未恢复。`
      );
    }

    for (const type of widgetTypes) {
      const widget = widgetsByType.get(type);
      await mainWindow.webContents.executeJavaScript(
        `window.api.setWidgetWindowMode(${widget.id}, 'desktop')`
      );
      assert(!windowsByType.get(type).isAlwaysOnTop(), `${type} 切回桌面模式后仍置顶。`);
    }
  });

  await runTest('管理端：light / dark / glass 主题切换', async () => {
    await mainWindow.webContents.executeJavaScript(
      "document.querySelector('[data-view=\"theme\"]').click()"
    );

    for (const theme of ['dark', 'glass', 'light']) {
      await mainWindow.webContents.executeJavaScript(`
        document.querySelector('[data-theme-option="${theme}"]').click();
        document.querySelector('#save-theme-btn').click();
      `);
      await waitFor(
        async () => {
          const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
          return config.theme === theme;
        },
        `${theme} 主题未保存。`
      );
      await waitFor(
        () => windowsByType.get('weather').webContents.executeJavaScript(
          `document.body.dataset.theme === '${theme}'`
        ),
        `${theme} 主题未同步到小组件。`
      );
    }
  });

  await runTest('管理端：阴影开关', async () => {
    await mainWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('#theme-shadow-input');
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('#save-theme-btn').click();
      })()
    `);
    await waitFor(
      () => windowsByType.get('weather').webContents.executeJavaScript(
        "document.body.classList.contains('no-shadow')"
      ),
      '关闭阴影后小组件未添加 no-shadow。'
    );

    await mainWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('#theme-shadow-input');
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('#save-theme-btn').click();
      })()
    `);
    await waitFor(
      () => windowsByType.get('weather').webContents.executeJavaScript(
        "!document.body.classList.contains('no-shadow')"
      ),
      '重新开启阴影后 no-shadow 未移除。'
    );
  });

  await runTest('更多菜单：显示、定位与齿轮设置分工', async () => {
    const clockWindow = windowsByType.get('clock');
    const menuState = await clockWindow.webContents.executeJavaScript(`
      (async () => {
        window.dispatchEvent(new CustomEvent('widget-context-menu-requested', {
          detail: { x: innerWidth - 2, y: innerHeight - 2 }
        }));
        await new Promise((resolve) => setTimeout(resolve, 80));
        const menu = document.querySelector('#widget-context-menu');
        const rect = menu.getBoundingClientRect();
        return {
          exists: Boolean(menu),
          inside: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
          actions: [...menu.querySelectorAll('[data-menu-action]')].map((button) => button.dataset.menuAction)
        };
      })()
    `);

    assert(menuState.exists, '右键菜单未显示。');
    assert(menuState.inside, '右键菜单超出窗口范围。');
    assert(
      JSON.stringify(menuState.actions) === JSON.stringify(['edit', 'hide', 'delete']),
      '更多菜单不应重复显示设置、尺寸、透明度或层级控制。'
    );

    await clockWindow.webContents.executeJavaScript(
      "document.querySelector('#widget-context-menu')?.remove(); document.querySelector('#settings-widget-btn').click()"
    );
    await waitFor(
      () => clockWindow.webContents.executeJavaScript(
        "Boolean(document.querySelector('#widget-settings-popover'))"
      ),
      '设置面板未显示。'
    );

    await clockWindow.webContents.executeJavaScript(`
      document.querySelector('[data-settings-close]').click();
      window.prompt = () => '回归时钟';
      window.dispatchEvent(new CustomEvent('widget-context-menu-requested', {
        detail: { x: 24, y: 24 }
      }));
    `);
    await waitFor(
      () => clockWindow.webContents.executeJavaScript(
        "Boolean(document.querySelector('[data-menu-action=\"edit\"]'))"
      ),
      '右键编辑操作未显示。'
    );
    await clockWindow.webContents.executeJavaScript(
      "document.querySelector('[data-menu-action=\"edit\"]').click()"
    );
    await waitFor(
      () => clockWindow.webContents.executeJavaScript(
        "document.title === '回归时钟'"
      ),
      '右键编辑后窗口标题未更新。'
    );
  });

  await runTest('齿轮设置：compact / comfortable / large 尺寸', async () => {
    const clockWindow = windowsByType.get('clock');
    const expectedSizes = {
      compact: [300, 200],
      comfortable: [480, 320],
      large: [660, 440]
    };

    await clockWindow.webContents.executeJavaScript(
      "document.querySelector('#settings-widget-btn').click()"
    );
    await waitFor(
      () => clockWindow.webContents.executeJavaScript(
        "Boolean(document.querySelector('#widget-settings-popover'))"
      ),
      '尺寸测试未打开齿轮设置面板。'
    );

    for (const [preset, expectedSize] of Object.entries(expectedSizes)) {
      await clockWindow.webContents.executeJavaScript(
        `document.querySelector('[data-settings-size="${preset}"]').click()`
      );
      await waitFor(
        () => {
          const size = clockWindow.getSize();
          return size[0] === expectedSize[0] && size[1] === expectedSize[1];
        },
        `${preset} 尺寸未应用。`
      );
    }

    await clockWindow.webContents.executeJavaScript(
      "document.querySelector('[data-settings-size=\"comfortable\"]').click()"
    );
    await waitFor(
      () => clockWindow.getSize()[0] === 480 && clockWindow.getSize()[1] === 320,
      '尺寸未恢复为 comfortable。'
    );
  });

  await runTest('窗口移动与位置持久化', async () => {
    const widget = widgetsByType.get('clock');
    const clockWindow = windowsByType.get('clock');
    const originalBounds = clockWindow.getBounds();
    const nextPosition = [
      originalBounds.x + 24,
      originalBounds.y + 18
    ];

    clockWindow.setPosition(nextPosition[0], nextPosition[1]);
    await wait(400);

    const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
    const widgetConfig = config.widgets[String(widget.id)];

    assert(widgetConfig.x === nextPosition[0], '窗口 x 坐标未持久化。');
    assert(widgetConfig.y === nextPosition[1], '窗口 y 坐标未持久化。');
    assert(
      await clockWindow.webContents.executeJavaScript(
        "getComputedStyle(document.querySelector('.widget-drag-bar')).webkitAppRegion === 'drag'"
      ),
      '窗口拖拽区域未启用。'
    );
  });

  await runTest('多显示器：越界位置仅收敛到可见工作区', async () => {
    const display = screen.getPrimaryDisplay();
    const { ensureBoundsInVisibleArea } = require('../electron/services/widgetWindowService');
    const bounds = ensureBoundsInVisibleArea({
      x: 999999,
      y: 999999,
      width: display.workArea.width + 100,
      height: display.workArea.height + 100
    });

    assert(bounds.x >= display.workArea.x && bounds.y >= display.workArea.y, '窗口左上角仍在工作区外。');
    assert(bounds.x + bounds.width <= display.workArea.x + display.workArea.width, '窗口右侧仍在工作区外。');
    assert(bounds.y + bounds.height <= display.workArea.y + display.workArea.height, '窗口底部仍在工作区外。');
  });

  await runTest('Clock：时间持续刷新且不重建时间节点', async () => {
    const clockWindow = windowsByType.get('clock');
    const firstClockState = await clockWindow.webContents.executeJavaScript(`
      (() => {
        window.__regressionClockNode = document.querySelector('#clock-time');
        return {
          time: window.__regressionClockNode.textContent,
          dateTime: window.__regressionClockNode.dateTime
        };
      })()
    `);

    await wait(1200);

    const clockState = await clockWindow.webContents.executeJavaScript(`
      ({
        time: document.querySelector('#clock-time').textContent,
        dateTime: document.querySelector('#clock-time').dateTime,
        sameNode: window.__regressionClockNode === document.querySelector('#clock-time')
      })
    `);

    assert(/^\d{2}:\d{2}$/.test(clockState.time), '时钟未保持 HH:mm 可读格式。');
    assert(clockState.dateTime !== firstClockState.dateTime, '时钟语义时间未按秒刷新。');
    assert(clockState.sameNode, '时钟刷新时重建了时间节点。');
  });

  await runTest('Weather：保存城市与强制刷新', async () => {
    const weatherWindow = windowsByType.get('weather');

    await weatherWindow.webContents.executeJavaScript(`
      (() => {
        document.querySelector('#weather-city').value = '上海';
        document.querySelector('#weather-city-form').requestSubmit();
      })()
    `);
    await waitFor(
      () => weatherWindow.webContents.executeJavaScript(
        "document.querySelector('#weather-message').textContent.includes('城市已保存')"
      ),
      '天气城市保存未完成。'
    );
    assert(
      await weatherWindow.webContents.executeJavaScript(
        "document.querySelector('#weather-city-name').textContent === '上海'"
      ),
      '天气城市显示未更新。'
    );

    await weatherWindow.webContents.executeJavaScript(
      "document.querySelector('#weather-refresh-btn').click()"
    );
    await waitFor(
      () => weatherWindow.webContents.executeJavaScript(
        "document.querySelector('#weather-message').textContent.includes('天气已刷新')"
      ),
      '天气刷新未完成。'
    );
  });

  let todoId = null;

  await runTest('Todo：新增、编辑与取消编辑', async () => {
    const todoWindow = windowsByType.get('todo');

    await todoWindow.webContents.executeJavaScript(`
      (() => {
        document.querySelector('#todo-title').value = '回归测试待办';
        document.querySelector('#todo-content').value = '验证新增和编辑';
        document.querySelector('#todo-priority').value = 'high';
        document.querySelector('#todo-due-time').value = '${getTodayDateTime(18, 0)}';
        document.querySelector('#todo-form').requestSubmit();
      })()
    `);
    await waitFor(
      () => todoWindow.webContents.executeJavaScript(
        "document.querySelector('#todo-message').textContent.includes('待办已新增') && Boolean(document.querySelector('[data-edit-todo-id]'))"
      ),
      '待办新增未完成。'
    );
    todoId = await todoWindow.webContents.executeJavaScript(
      "Number(document.querySelector('[data-edit-todo-id]').dataset.editTodoId)"
    );

    await todoWindow.webContents.executeJavaScript(
      "document.querySelector('[data-edit-todo-id]').click()"
    );
    await waitFor(
      () => todoWindow.webContents.executeJavaScript(
        "Boolean(document.querySelector('#todo-edit-id').value)"
      ),
      '待办未进入编辑状态。'
    );
    await todoWindow.webContents.executeJavaScript(`
      document.querySelector('#todo-title').value = '已编辑的回归待办';
      document.querySelector('#todo-form').requestSubmit();
    `);
    await waitFor(
      () => todoWindow.webContents.executeJavaScript(
        "document.querySelector('#todo-list').textContent.includes('已编辑的回归待办')"
      ),
      '待办编辑结果未显示。'
    );

    await todoWindow.webContents.executeJavaScript(
      "document.querySelector('[data-edit-todo-id]').click()"
    );
    await waitFor(
      () => todoWindow.webContents.executeJavaScript(
        "!document.querySelector('#todo-cancel-edit-btn').hidden"
      ),
      '待办取消编辑按钮未显示。'
    );
    await todoWindow.webContents.executeJavaScript(
      "document.querySelector('#todo-cancel-edit-btn').click()"
    );
    assert(
      await todoWindow.webContents.executeJavaScript(
        "document.querySelector('#todo-edit-id').value === ''"
      ),
      '取消编辑后仍保留编辑 ID。'
    );
  });

  await runTest('Todo：完成、恢复与删除', async () => {
    const todoWindow = windowsByType.get('todo');

    await todoWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[data-toggle-todo-id="${todoId}"]');
        input.checked = true;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await waitFor(
      () => todoWindow.webContents.executeJavaScript(
        "document.querySelector('.todo-item').classList.contains('is-completed')"
      ),
      '待办完成状态未显示。'
    );

    await todoWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('[data-toggle-todo-id="${todoId}"]');
        input.checked = false;
        input.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await waitFor(
      () => todoWindow.webContents.executeJavaScript(
        "!document.querySelector('.todo-item').classList.contains('is-completed')"
      ),
      '待办恢复未完成状态失败。'
    );

    await todoWindow.webContents.executeJavaScript(`
      window.confirm = () => true;
      document.querySelector('[data-delete-todo-id="${todoId}"]').click();
    `);
    await waitFor(
      () => todoWindow.webContents.executeJavaScript(
        "!document.querySelector('[data-delete-todo-id]')"
      ),
      '待办删除后仍在列表中。'
    );
  });

  let quickNoteId = null;
  let editorNoteId = null;

  await runTest('Notes：底部输入与顶部新增立即创建', async () => {
    const notesWindow = windowsByType.get('notes');
    const notesWidget = widgetsByType.get('notes');

    await notesWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('#notes-quick-input');
        input.value = '回归测试便签正文';
        document.querySelector('#notes-quick-form').requestSubmit();
      })()
    `);
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "document.querySelector('#notes-list').textContent.includes('回归测试便签正文')"
      ),
      '底部快速输入未创建便签。'
    );
    quickNoteId = Number(noteService.getNotes(notesWidget.id)[0]?.id);
    assert(Number.isInteger(quickNoteId), '快速输入创建的便签 ID 无效。');

    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('#notes-add-btn').click()"
    );
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "!document.querySelector('#note-editor').hidden && document.querySelector('#note-editor-title').value === '新便签'"
      ),
      '顶部新增按钮未创建并打开便签。'
    );
    editorNoteId = Number(noteService.getNotes(notesWidget.id).find((note) => note.title === '新便签')?.id);
    assert(Number.isInteger(editorNoteId), '顶部新增创建的便签 ID 无效。');
  });

  await runTest('Notes：编辑自动保存、分类与置顶', async () => {
    const notesWindow = windowsByType.get('notes');
    const notesWidget = widgetsByType.get('notes');

    await notesWindow.webContents.executeJavaScript(`
      (() => {
        const title = document.querySelector('#note-editor-title');
        const content = document.querySelector('#note-editor-content');
        const category = document.querySelector('#note-editor-category');
        const pinned = document.querySelector('#note-editor-pinned');
        title.value = '顶部新增便签';
        content.value = '自动保存验证内容';
        category.value = '工作';
        pinned.checked = true;
        title.dispatchEvent(new Event('input', { bubbles: true }));
        content.dispatchEvent(new Event('input', { bubbles: true }));
        category.dispatchEvent(new Event('change', { bubbles: true }));
        pinned.dispatchEvent(new Event('change', { bubbles: true }));
      })()
    `);
    await waitFor(() => {
      const note = noteService.getNoteById(notesWidget.id, editorNoteId);
      return note?.title === '顶部新增便签'
        && note?.content === '自动保存验证内容'
        && note?.category === '工作'
        && note?.isPinned === true;
    }, '编辑、分类或置顶状态未在防抖后保存。', 6000);
    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('#note-editor-close').click()"
    );
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "document.querySelector('#note-editor').hidden"
      ),
      '便签编辑器未关闭。'
    );
  });

  await runTest('Notes：三个点使用同层紧凑菜单并执行操作', async () => {
    const notesWindow = windowsByType.get('notes');

    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('#notes-more-btn').click()"
    );
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "!document.querySelector('#notes-more-menu').hidden"
      ),
      '快速便签更多菜单未打开。'
    );
    const menuState = await notesWindow.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('.notes-widget').getBoundingClientRect();
      const menu = document.querySelector('#notes-more-menu').getBoundingClientRect();
      return {
        itemCount: document.querySelectorAll('#notes-more-menu [role="menuitem"]').length,
        genericMenuVisible: Boolean(document.querySelector('#widget-context-menu')),
        withinWidgetLayer: menu.left >= root.left && menu.top >= root.top && menu.right <= root.right && menu.bottom <= root.bottom
      };
    })()`);
    assert(menuState.itemCount === 6, `快速便签菜单操作项数量异常：${menuState.itemCount}`);
    assert(!menuState.genericMenuVisible, '点击三个点仍打开了全局组件控制面板。');
    assert(menuState.withinWidgetLayer, '快速便签菜单超出组件窗口图层。');

    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('[data-notes-menu-action=\"search\"]').click()"
    );
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "!document.querySelector('#notes-search-panel').hidden && document.querySelector('#notes-more-menu').hidden"
      ),
      '菜单搜索操作未打开搜索栏或未关闭菜单。'
    );
    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('#notes-search-close').click()"
    );

    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('#notes-more-btn').click()"
    );
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "!document.querySelector('#notes-more-menu').hidden"
      ),
      '切换尺寸前菜单未重新打开。'
    );
    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('[data-notes-menu-action=\"toggle-compact\"]').click()"
    );
    await waitFor(
      () => {
        const bounds = notesWindow.getBounds();
        return bounds.width === 340 && bounds.height === 440;
      },
      '菜单紧凑模式未调整为 340 × 440。'
    );

    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('#notes-more-btn').click()"
    );
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "!document.querySelector('#notes-more-menu').hidden && document.querySelector('#notes-compact-label').textContent.includes('标准')"
      ),
      '紧凑模式下菜单状态未同步。'
    );
    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('[data-notes-menu-action=\"toggle-compact\"]').click()"
    );
    await waitFor(
      () => {
        const bounds = notesWindow.getBounds();
        return bounds.width === 380 && bounds.height === 500;
      },
      '菜单未从紧凑模式恢复标准尺寸。'
    );
  });

  await runTest('Notes：实时搜索标题、正文与分类', async () => {
    const notesWindow = windowsByType.get('notes');

    await notesWindow.webContents.executeJavaScript(`
      (() => {
        document.querySelector('#notes-search-btn').click();
        const input = document.querySelector('#notes-search-input');
        input.value = '工作';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "document.querySelectorAll('[data-note-id]').length === 1 && document.querySelector('#notes-list').textContent.includes('顶部新增便签')"
      ),
      '按分类实时搜索未返回预期结果。'
    );
    await notesWindow.webContents.executeJavaScript(
      "document.querySelector('#notes-search-close').click()"
    );
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "document.querySelectorAll('[data-note-id]').length === 2"
      ),
      '关闭搜索后未恢复完整列表。'
    );
  });

  await runTest('Notes：窗口刷新后数据持久化与删除确认', async () => {
    const notesWindow = windowsByType.get('notes');
    const notesWidget = widgetsByType.get('notes');
    const loadPromise = waitForLoad(notesWindow);

    notesWindow.reload();
    await loadPromise;
    await waitFor(
      () => notesWindow.webContents.executeJavaScript(
        "(() => { const text = document.querySelector('#notes-list')?.textContent || ''; return text.includes('顶部新增便签') && text.includes('回归测试便签正文'); })()"
      ),
      '窗口刷新后便签数据未恢复。'
    );
    await notesWindow.webContents.executeJavaScript(`
      (() => {
        window.confirm = () => true;
        document.querySelector('[data-delete-note="${quickNoteId}"]').click();
      })()
    `);
    await waitFor(
      () => !noteService.getNoteById(notesWidget.id, quickNoteId),
      '删除便签后数据库记录仍然存在。'
    );
    assert(noteService.getNoteById(notesWidget.id, editorNoteId), '删除单条便签误伤了其他便签。');
    notesWindow.hide();
  });

  await runTest('组件类型：数据看板已移除', async () => {
    assert(!widgetsByType.has('dashboard'), '数据看板不应再被创建。');
    assert(
      await mainWindow.webContents.executeJavaScript(
        "!Array.from(document.querySelectorAll('[data-add-widget-type]')).some((button) => button.dataset.addWidgetType === 'dashboard')"
      ),
      '管理中心仍显示数据看板入口。'
    );
  });

  await runTest('FloatingFolder：新建分区可选择图标并持久化', async () => {
    const folderWidget = widgetsByType.get('floatingFolder');
    const folderWindow = windowsByType.get('floatingFolder');

    await folderWindow.webContents.executeJavaScript(`(() => {
      document.querySelector('[data-action="new-zone"]').click();
      const form = document.querySelector('#floating-folder-zone-form');
      form.querySelector('#floating-folder-zone-name').value = '图标测试';
      form.querySelector('[data-zone-icon="travel"]').click();
      form.requestSubmit();
    })()`);

    await waitFor(async () => {
      const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
      const zones = config.widgets[String(folderWidget.id)]?.floatingFolder?.zones || [];
      return zones.some((zone) => zone.name === '图标测试' && zone.iconKey === 'travel');
    }, '新分区图标未持久化。');

    const createdState = await folderWindow.webContents.executeJavaScript(`(() => {
      const button = [...document.querySelectorAll('.ff-zone-tab[data-category-id]')]
        .find((item) => item.textContent.includes('图标测试'));
      const icon = button?.querySelector('.ff-zone-icon');
      return {
        zoneId: button?.dataset.categoryId || '',
        selected: button?.classList.contains('is-active') || false,
        iconLoaded: Boolean(icon instanceof HTMLImageElement && icon.complete && icon.naturalWidth > 0 && icon.src.endsWith('/nav-icons/travel.svg'))
      };
    })()`);
    assert(createdState.zoneId && createdState.selected && createdState.iconLoaded, '新分区未显示所选分区图标。');

    await folderWindow.webContents.executeJavaScript(`(() => {
      document.querySelector('#floating-folder-more-btn').click();
      document.querySelector('#floating-folder-more-menu [data-action="manage-zones"]').click();
    })()`);
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector('[data-action="delete-zone"][data-category-id="${createdState.zoneId}"]'))`
      ),
      '新建分区未出现在分区管理中。'
    );
    await folderWindow.webContents.executeJavaScript(
      `document.querySelector('[data-action="delete-zone"][data-category-id="${createdState.zoneId}"]').click()`
    );
    await waitFor(async () => {
      const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
      const zones = config.widgets[String(folderWidget.id)]?.floatingFolder?.zones || [];
      return !zones.some((zone) => zone.id === '${createdState.zoneId}');
    }, '图标测试分区清理失败。');
  });

  await runTest('FloatingFolder：添加快捷引用且不显示文件夹绑定界面', async () => {
    const folderWindow = windowsByType.get('floatingFolder');

    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        "Boolean(document.querySelector('.floating-folder-widget')) && getComputedStyle(document.querySelector('.widget-card')).width !== '206px'"
      ),
      '快捷收纳区未完整展示。'
    );
    await folderWindow.webContents.executeJavaScript(
      "document.querySelector('[data-action=\"add-items\"]').click()"
    );
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        "document.querySelectorAll('[data-file-index]').length === 3"
      ),
      '快捷引用添加未完成。'
    );
    assert(
      await folderWindow.webContents.executeJavaScript(
        "document.querySelectorAll('[data-file-index]').length === 3"
      ),
      '快捷收纳区未展示已选择的文件、文件夹。'
    );
    assert(
      await folderWindow.webContents.executeJavaScript(
        "Boolean(document.querySelector('.ff-title-mark')?.complete) && !document.querySelector('#floating-folder-path') && !document.querySelector('#floating-folder-choose-btn')"
      ),
      '新版标题图标未加载，或旧文件夹路径、绑定入口仍然存在。'
    );
  });

  await runTest('FloatingFolder：标题区域可拖动且操作按钮保持可点击', async () => {
    const folderWindow = windowsByType.get('floatingFolder');
    const dragState = await folderWindow.webContents.executeJavaScript(`(() => {
      const titlebar = document.querySelector('.ff-titlebar');
      const title = document.querySelector('.ff-title');
      const titleCopy = document.querySelector('.ff-title-copy strong');
      const titleMark = document.querySelector('.ff-title-mark-shell');
      const actions = document.querySelector('.ff-title-actions');
      const actionButton = document.querySelector('.ff-icon-button');
      const appRegion = (node) => node ? getComputedStyle(node).webkitAppRegion : '';
      return {
        titlebar: appRegion(titlebar),
        title: appRegion(title),
        titleCopy: appRegion(titleCopy),
        titleMark: appRegion(titleMark),
        actions: appRegion(actions),
        actionButton: appRegion(actionButton)
      };
    })()`);

    assert(folderWindow.isMovable(), '快捷收纳区窗口被错误设置为不可移动。');
    assert(
      dragState.titlebar === 'drag'
        && dragState.title === 'drag'
        && dragState.titleCopy === 'drag'
        && dragState.titleMark === 'drag',
      `标题拖动区域未完整恢复：${JSON.stringify(dragState)}`
    );
    assert(
      dragState.actions === 'no-drag' && dragState.actionButton === 'no-drag',
      `标题栏操作按钮不应属于拖动区域：${JSON.stringify(dragState)}`
    );
  });

  await runTest('FloatingFolder：设置面板切换三种显示层级并持久化', async () => {
    const folderWidget = widgetsByType.get('floatingFolder');
    const folderWindow = windowsByType.get('floatingFolder');
    const options = await folderWindow.webContents.executeJavaScript(`(() => (
      Array.from(document.querySelectorAll('#floating-folder-window-mode-controls [data-window-mode]'))
        .map((button) => ({ mode: button.dataset.windowMode, label: button.textContent.trim() }))
    ))()`);

    assert(
      JSON.stringify(options) === JSON.stringify([
        { mode: 'desktop', label: '固定到桌面' },
        { mode: 'normal', label: '普通窗口' },
        { mode: 'alwaysOnTop', label: '始终置顶' }
      ]),
      `显示层级选项不完整：${JSON.stringify(options)}`
    );

    for (const mode of ['normal', 'alwaysOnTop', 'desktop']) {
      await folderWindow.webContents.executeJavaScript(
        `document.querySelector('#floating-folder-window-mode-controls [data-window-mode="${mode}"]').click()`
      );
      await waitFor(async () => {
        const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
        return config.widgets[String(folderWidget.id)]?.windowMode === mode;
      }, `显示层级 ${mode} 未持久化。`);
      const activeMode = await folderWindow.webContents.executeJavaScript(
        "document.querySelector('#floating-folder-window-mode-controls .is-active')?.dataset.windowMode"
      );
      assert(activeMode === mode, `显示层级选中状态未同步：${activeMode}/${mode}`);
      assert(
        folderWindow.isAlwaysOnTop() === (mode === 'alwaysOnTop'),
        `显示层级 ${mode} 的窗口状态不正确。`
      );
    }
  });

  await runTest('FloatingFolder：空白区域右键不显示组件控制菜单', async () => {
    const folderWindow = windowsByType.get('floatingFolder');

    await folderWindow.webContents.executeJavaScript(`
      (() => {
        document.querySelector('#widget-context-menu')?.remove();
        const fileMenu = document.querySelector('#floating-folder-file-menu');
        fileMenu.hidden = true;
        document.querySelector('.ff-app-surface').dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 390,
          clientY: 360,
          button: 2
        }));
      })()
    `);
    await wait(120);
    const menuState = await folderWindow.webContents.executeJavaScript(`({
      genericMenu: Boolean(document.querySelector('#widget-context-menu')),
      fileMenuVisible: !document.querySelector('#floating-folder-file-menu').hidden
    })`);

    assert(!menuState.genericMenu, '空白区域仍显示通用组件控制菜单。');
    assert(!menuState.fileMenuVisible, '空白区域误显示文件专用菜单。');
  });

  await runTest('FloatingFolder：图标大小和间距滑块实时生效并保存', async () => {
    const folderWidget = widgetsByType.get('floatingFolder');
    const folderWindow = windowsByType.get('floatingFolder');

    await folderWindow.webContents.executeJavaScript(`
      (() => {
        const sizeInput = document.querySelector('#floating-folder-icon-size');
        const gapInput = document.querySelector('#floating-folder-icon-gap');
        sizeInput.value = '68';
        sizeInput.dispatchEvent(new Event('input', { bubbles: true }));
        gapInput.value = '22';
        gapInput.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    const visualState = await folderWindow.webContents.executeJavaScript(`(() => {
      const icon = document.querySelector('.ff-app-icon-shell');
      const gridStyle = getComputedStyle(document.querySelector('.ff-app-grid'));
      return {
        iconWidth: Math.round(icon.getBoundingClientRect().width),
        rowGap: gridStyle.rowGap,
        columnGap: gridStyle.columnGap,
        sizeOutput: document.querySelector('#floating-folder-icon-size-output').value,
        gapOutput: document.querySelector('#floating-folder-icon-gap-output').value
      };
    })()`);

    assert(Math.abs(visualState.iconWidth - 68) <= 1, `图标宽度未实时变化：${visualState.iconWidth}px`);
    assert(visualState.rowGap === '22px' && visualState.columnGap === '22px', `网格间距未实时变化：${visualState.rowGap}/${visualState.columnGap}`);
    assert(visualState.sizeOutput === '68px' && visualState.gapOutput === '22px', '滑块数值提示未同步。');
    await waitFor(
      async () => {
        const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
        const folderConfig = config.widgets[String(folderWidget.id)]?.floatingFolder;
        return Number(folderConfig?.iconSize) === 68 && Number(folderConfig?.iconGap) === 22;
      },
      '图标大小或间距未持久化。'
    );
  });

  await runTest('FloatingFolder：组件透明度 100% 真正不透明', async () => {
    const folderWidget = widgetsByType.get('floatingFolder');
    const folderWindow = windowsByType.get('floatingFolder');

    await folderWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('#floating-folder-opacity');
        input.value = '65';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await waitFor(() => Math.abs(folderWindow.getOpacity() - 0.65) < 0.02, '组件 65% 透明度未生效。');
    await folderWindow.webContents.executeJavaScript(`
      (() => {
        const input = document.querySelector('#floating-folder-opacity');
        input.value = '100';
        input.dispatchEvent(new Event('input', { bubbles: true }));
      })()
    `);
    await waitFor(
      async () => {
        const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
        return Number(config.widgets[String(folderWidget.id)]?.opacity) === 1
          && Math.abs(folderWindow.getOpacity() - 1) < 0.01;
      },
      '组件 100% 透明度未恢复为完全不透明。'
    );
    const surfaceState = await folderWindow.webContents.executeJavaScript(`(() => {
      const background = getComputedStyle(document.querySelector('.widget-card')).backgroundColor;
      const match = background.match(/rgba?\\(([^)]+)\\)/);
      const channels = match ? match[1].split(',').map((part) => Number(part.trim())) : [];
      return {
        background,
        opaque: channels.length === 3 || channels[3] === 1
      };
    })()`);

    assert(surfaceState.opaque, `组件表面仍为半透明：${surfaceState.background}`);
  });

  await runTest('FloatingFolder：快捷打开文件或文件夹', async () => {
    const folderWindow = windowsByType.get('floatingFolder');

    await folderWindow.webContents.executeJavaScript(
      "document.querySelector('[data-file-index]').click()"
    );
    await waitFor(
      () => openedPaths.some((openedPath) => openedPath.startsWith(fixturePath)),
      '快捷打开未调用系统路径接口。'
    );
  });

  await runTest('FloatingFolder：拒绝启动未登记的路径', async () => {
    const folderWidget = widgetsByType.get('floatingFolder');
    const openedCount = openedPaths.length;
    const result = await mainWindow.webContents.executeJavaScript(
      `window.api.openFloatingFolderFile(${folderWidget.id}, ${JSON.stringify(process.execPath)})`
    );

    assert(result?.success === false, '未登记路径不应被快捷收纳区启动。');
    assert(openedPaths.length === openedCount, '未登记路径仍调用了系统启动接口。');
  });

  await runTest('FloatingFolder：拉出分区后从原组件转移并完整显示', async () => {
    const folderWidget = widgetsByType.get('floatingFolder');
    const folderWindow = windowsByType.get('floatingFolder');

    await folderWindow.webContents.executeJavaScript(
      "document.querySelector('[data-category-id=\"develop\"]').click()"
    );
    await folderWindow.webContents.executeJavaScript(
      "document.querySelector('[data-action=\"add-items\"]').click()"
    );
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        "document.querySelector('[data-category-id=\"develop\"]')?.classList.contains('is-active') && document.querySelectorAll('[data-file-index]').length === 3"
      ),
      '测试快捷项未移动到开发分区。'
    );

    await folderWindow.webContents.executeJavaScript(
      "document.querySelector('[data-action=\"detach-zone\"]').click()"
    );
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        "!document.querySelector('[data-category-id=\"develop\"]')"
      ),
      '开发分区拉出后仍保留在原组件。'
    );

    let detachedWidget = null;
    await waitFor(async () => {
      const widgets = await mainWindow.webContents.executeJavaScript('window.api.getWidgetList()');
      detachedWidget = widgets.find((widget) => widget.type === 'floatingFolder' && widget.id !== folderWidget.id && widget.name === '开发') || null;
      return Boolean(detachedWidget);
    }, '未创建独立开发组件。');
    const config = await mainWindow.webContents.executeJavaScript('window.api.getConfig()');
    const parentConfig = config.widgets[String(folderWidget.id)]?.floatingFolder;
    const childConfig = config.widgets[String(detachedWidget.id)];

    assert(!parentConfig.zones.some((zone) => zone.id === 'develop'), '原组件配置仍包含开发分区。');
    assert(parentConfig.addedFilePaths.length === 0, '已转移的快捷项仍留在原组件。');
    assert(childConfig.floatingFolderDetachedZoneId === 'develop', '独立组件未标记为拉出分区。');
    assert(!childConfig.floatingFolderSourceWidgetId, '独立组件仍依赖原组件数据。');
    assert(childConfig.floatingFolder.addedFilePaths.length === 3, '开发分区快捷项未完整转移。');

    const detachedWindow = await waitForWidgetWindow(detachedWidget.id);
    await waitFor(
      () => detachedWindow.webContents.executeJavaScript(
        "document.body.classList.contains('ff-detached-zone') && document.querySelectorAll('[data-file-index]').length === 3"
      ),
      '独立开发组件未完成分区数据渲染。'
    );
    const detachedMetrics = await detachedWindow.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('.floating-folder-widget');
      const title = document.querySelector('#floating-folder-title');
      const surface = document.querySelector('.ff-app-surface');
      return {
        detached: document.body.classList.contains('ff-detached-zone'),
        title: title.textContent,
        titleClipped: title.scrollWidth > title.clientWidth,
        tabsHidden: document.querySelector('#floating-folder-zone-tabs').hidden,
        gridRows: getComputedStyle(root).gridTemplateRows.split(' ').length,
        surfaceHeight: Math.round(surface.getBoundingClientRect().height)
      };
    })()`);

    assert(detachedMetrics.detached, '独立开发组件未进入独立布局。');
    assert(detachedMetrics.title === '开发' && !detachedMetrics.titleClipped, '独立组件标题显示不完整。');
    assert(detachedMetrics.tabsHidden && detachedMetrics.gridRows === 2, '独立组件仍为隐藏的分区栏保留空间。');
    assert(detachedMetrics.surfaceHeight >= 220, `独立组件内容区高度不足：${detachedMetrics.surfaceHeight}`);
  });

  await runTest('FloatingFolder：拖入引用与文件右键移除', async () => {
    const folderWindow = windowsByType.get('floatingFolder');
    const debuggerApi = folderWindow.webContents.debugger;
    const dragData = {
      items: [],
      files: [externalFixturePath],
      dragOperationsMask: 1
    };

    folderWindow.showInactive();
    if (!debuggerApi.isAttached()) debuggerApi.attach('1.3');
    await debuggerApi.sendCommand('Input.dispatchDragEvent', { type: 'dragEnter', x: 120, y: 150, data: dragData });
    await debuggerApi.sendCommand('Input.dispatchDragEvent', { type: 'dragOver', x: 120, y: 150, data: dragData });
    await debuggerApi.sendCommand('Input.dispatchDragEvent', { type: 'drop', x: 120, y: 150, data: dragData });
    debuggerApi.detach();
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        `Array.from(document.querySelectorAll('.ff-app-item[data-file-path]')).some((item) => item.dataset.filePath === ${JSON.stringify(externalFixturePath)})`
      ),
      '外部拖入文件未出现在收纳区。'
    );

    await folderWindow.webContents.executeJavaScript(`
      (() => {
        const item = Array.from(document.querySelectorAll('.ff-app-item[data-file-path]'))
          .find((node) => node.dataset.filePath === ${JSON.stringify(externalFixturePath)});
        item.dispatchEvent(new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: 90,
          clientY: 90,
          button: 2
        }));
      })()
    `);
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        "!document.querySelector('#floating-folder-file-menu').hidden && !document.querySelector('#widget-context-menu')"
      ),
      '文件右键未显示专用操作菜单。'
    );
    await folderWindow.webContents.executeJavaScript(
      "document.querySelector('[data-file-menu-action=\"remove\"]').click()"
    );
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        `!Array.from(document.querySelectorAll('.ff-app-item[data-file-path]')).some((item) => item.dataset.filePath === ${JSON.stringify(externalFixturePath)})`
      ),
      '文件从收纳区移除后仍在显示。'
    );
    const reloadPromise = new Promise((resolve) => folderWindow.webContents.once('did-finish-load', resolve));
    folderWindow.reload();
    await reloadPromise;
    await waitFor(
      () => folderWindow.webContents.executeJavaScript(
        `Boolean(document.querySelector('.floating-folder-widget')) && !Array.from(document.querySelectorAll('.ff-app-item[data-file-path]')).some((item) => item.dataset.filePath === ${JSON.stringify(externalFixturePath)})`
      ),
      '重启后已移除文件又重新出现。'
    );
    assert(fs.existsSync(externalFixturePath), '从收纳区移除不应删除磁盘原文件。');
  });

  await runTest('Reduced motion：关闭循环和入场动画', async () => {
    const weatherWindow = windowsByType.get('weather');
    const debuggerApi = weatherWindow.webContents.debugger;

    if (!debuggerApi.isAttached()) {
      debuggerApi.attach('1.3');
    }

    await debuggerApi.sendCommand('Emulation.setEmulatedMedia', {
      media: 'screen',
      features: [
        {
          name: 'prefers-reduced-motion',
          value: 'reduce'
        }
      ]
    });
    const motionState = await weatherWindow.webContents.executeJavaScript(`
      ({
        reduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
        motionLoaded: Boolean(window.Motion?.animate),
        motionHelperReduced: window.DwmUi?.shouldReduceMotion?.() === true,
        animationName: getComputedStyle(document.querySelector('.video-hero-object')).animationName
      })
    `);

    assert(motionState.reduced, 'reduced motion 媒体查询未生效。');
    assert(motionState.motionLoaded, '独立小组件未加载本地 Motion。');
    assert(motionState.motionHelperReduced, 'Motion 辅助层未遵循 reduced motion。');
    assert(motionState.animationName === 'none', `主对象动画仍为 ${motionState.animationName}。`);
    debuggerApi.detach();
  });

  await runTest('IPC 与渲染稳定性：无解析错误或崩溃', async () => {
    const relevantErrors = rendererErrors.filter((entry) => (
      /uncaught|syntaxerror|referenceerror|typeerror|渲染进程退出/i.test(entry.message)
    ));

    assert(
      relevantErrors.length === 0,
      `检测到渲染错误：${JSON.stringify(relevantErrors)}`
    );
  });

  writeReports();

  if (process.env.REGRESSION_HOLD === '1') {
    const manualClockWindow = windowsByType.get('clock');

    manualClockWindow.setPosition(240, 180);
    manualClockWindow.show();
    manualClockWindow.focus();
    console.log('[regression] 手动交互窗口已就绪，120 秒后自动关闭。');
    await wait(120000);
  }

  BrowserWindow.getAllWindows().forEach((browserWindow) => {
    if (!browserWindow.isDestroyed()) {
      browserWindow.destroy();
    }
  });
  database.closeDatabase();
}

runRegression()
  .catch((error) => {
    exitCode = 1;
    console.error('[regression] 回归脚本异常：', error);

    try {
      writeReports();
    } catch (reportError) {
      console.error('[regression] 报告写入失败：', reportError);
    }
  })
  .finally(() => {
    try {
      require('../electron/services/widgetWindowService').stopWidgetWindowEvents();
    } catch (error) {
      console.error('[regression] 停止窗口模式服务失败：', error);
    }
    app.exit(exitCode);
  });
