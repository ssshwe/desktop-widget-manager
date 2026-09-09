process.env.DWM_DISABLE_DESKTOP_ATTACHMENT = '1';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const isInitialSizeQa = process.argv.includes('--initial-size');
const outputRoot = path.join(
  projectRoot,
  'output',
  'qa',
  isInitialSizeQa ? 'notes-initial-size' : 'notes-visual'
);
const userDataPath = path.join(outputRoot, 'user-data');
const implementationPath = path.join(outputRoot, 'implementation.png');
const menuPath = path.join(outputRoot, 'menu.png');
const searchPath = path.join(outputRoot, 'search.png');
const editorPath = path.join(outputRoot, 'editor.png');
const reportPath = path.join(outputRoot, 'report.json');
const rendererErrors = [];

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check, message, timeout = 6000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeout) {
    if (await check()) return;
    await wait(60);
  }
  throw new Error(message);
}

async function capture(window, filePath) {
  fs.writeFileSync(filePath, (await window.capturePage()).toPNG());
}

async function registerIpc() {
  const {
    applyThemeToAllWidgetWindows,
    broadcastWidgetEvent,
    closeWidgetWindow,
    createWidgetWindow,
    getWidgetWindowMode,
    setWidgetWindowMode,
    showWidgetSettings,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  } = require('../electron/services/widgetWindowService');
  const { registerConfigIpc } = require('../electron/ipc/configIpc');
  const { registerNoteIpc } = require('../electron/ipc/noteIpc');
  const { registerWidgetIpc } = require('../electron/ipc/widgetIpc');

  registerConfigIpc({ applyThemeToAllWidgetWindows });
  registerWidgetIpc({
    closeWidgetWindow,
    createWidgetWindow,
    getWidgetWindowMode,
    setWidgetWindowMode,
    showWidgetSettings,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  });
  registerNoteIpc({ broadcastWidgetEvent });
}

async function run() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  app.commandLine.appendSwitch('disable-gpu');
  await app.whenReady();

  const database = require('../electron/db/database');
  const noteService = require('../electron/services/noteService');
  const widgetService = require('../electron/services/widgetService');
  const windowService = require('../electron/services/widgetWindowService');

  await database.initializeDatabase();
  await registerIpc();

  const widget = widgetService.createWidget({ type: 'notes', name: '快速便签' });
  const noteFixtures = isInitialSizeQa ? [
    ['新便签', '点击编辑便签内容', '学习', false]
  ] : [
    ['期末复习计划', '高数、操作系统、数据库重点复习，周五前完成所有章节和练习题。', '学习', true],
    ['临时复制的文本', 'Windows 11 支持多桌面和窗口分组，提升工作效率。', '临时', false],
    ['操作系统课堂笔记', '进程状态：就绪、运行、阻塞、挂起……', '学习', false],
    ['产品设计参考链接', 'https://www.behance.net/gallery/…', '工作', false],
    ['购物清单', '牛奶、鸡蛋、面包、西蓝花、纸巾', '生活', false],
    ['今日待办', '□ 写周报　□ 代码评审　□ 运动 30 分钟', '重要', false]
  ];
  noteFixtures.forEach(([title, content, category, isPinned]) => {
    noteService.createNote(widget.id, { title, content, category, isPinned });
  });

  const now = new Date();
  const timestampFor = (month, day, hour, minute, dayOffset = 0) => {
    const value = new Date(now.getFullYear(), month, day + dayOffset, hour, minute, 0, 0);
    return value.toISOString();
  };
  const todayMonth = now.getMonth();
  const todayDay = now.getDate();
  const referenceTimes = new Map([
    ['期末复习计划', timestampFor(todayMonth, todayDay, 9, 30)],
    ['临时复制的文本', timestampFor(todayMonth, todayDay, 16, 45, -1)],
    ['操作系统课堂笔记', timestampFor(todayMonth, todayDay, 10, 12, -1)],
    ['产品设计参考链接', timestampFor(5, 2, 14, 28)],
    ['购物清单', timestampFor(5, 1, 19, 8)],
    ['今日待办', timestampFor(5, 1, 9, 20)]
  ]);
  const qaDatabase = database.getDatabase();
  referenceTimes.forEach((updatedAt, title) => {
    qaDatabase.run(
      'UPDATE notes SET updated_at = ? WHERE widget_instance_id = ? AND title = ?',
      [updatedAt, widget.id, title]
    );
  });
  database.persistDatabase();

  const widgetWindow = windowService.createWidgetWindow(widget);
  widgetWindow.webContents.on('console-message', (event, detailsOrLevel, message) => {
    const details = typeof detailsOrLevel === 'object' ? detailsOrLevel : { level: detailsOrLevel, message };
    if (Number(details.level) >= 2) rendererErrors.push(details.message || '');
  });
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      `document.querySelectorAll('.note-card').length === ${noteFixtures.length}`
    ),
    '快速便签列表未完成渲染。'
  );
  widgetWindow.showInactive();
  // 等待表面入场动画完全结束，避免半透明中间帧干扰像素级对照。
  await wait(760);

  const metrics = await widgetWindow.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.notes-widget');
    const list = document.querySelector('#notes-list');
    return {
      viewport: { width: innerWidth, height: innerHeight },
      cardCount: document.querySelectorAll('.note-card').length,
      horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
      rootOverflow: root.scrollWidth > root.clientWidth || root.scrollHeight > root.clientHeight,
      listScrollable: list.scrollHeight > list.clientHeight,
      buttons: {
        add: Boolean(document.querySelector('#notes-add-btn')),
        search: Boolean(document.querySelector('#notes-search-btn')),
        more: Boolean(document.querySelector('#notes-more-btn')),
        send: Boolean(document.querySelector('#notes-quick-submit'))
      }
    };
  })()`);

  await capture(widgetWindow, implementationPath);
  await widgetWindow.webContents.executeJavaScript(
    "document.querySelector('#notes-more-btn').click()"
  );
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "!document.querySelector('#notes-more-menu').hidden"
    ),
    '更多菜单未打开。'
  );
  await wait(180);
  await capture(widgetWindow, menuPath);
  const menuMetrics = await widgetWindow.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.notes-widget').getBoundingClientRect();
    const menu = document.querySelector('#notes-more-menu').getBoundingClientRect();
    return {
      itemCount: document.querySelectorAll('#notes-more-menu [role="menuitem"]').length,
      withinWidgetLayer: menu.left >= root.left && menu.top >= root.top && menu.right <= root.right && menu.bottom <= root.bottom,
      menuRect: { left: menu.left, top: menu.top, right: menu.right, bottom: menu.bottom }
    };
  })()`);
  await widgetWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-notes-menu-action="search"]').click();
    const input = document.querySelector('#notes-search-input');
    input.value = '学习';
    input.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      `document.querySelectorAll('.note-card').length === ${isInitialSizeQa ? 1 : 2}`
    ),
    '搜索态未完成渲染。'
  );
  await wait(160);
  await capture(widgetWindow, searchPath);
  await widgetWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('#notes-search-close').click();
  })()`);
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      `document.querySelectorAll('.note-card').length === ${noteFixtures.length}`
    ),
    '关闭搜索后列表未恢复。'
  );
  await widgetWindow.webContents.executeJavaScript(
    "document.querySelector('.note-card').click()"
  );
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "!document.querySelector('#note-editor').hidden"
    ),
    '编辑态未打开。'
  );
  await wait(160);
  await capture(widgetWindow, editorPath);

  fs.writeFileSync(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    implementationPath,
    menuPath,
    searchPath,
    editorPath,
    metrics,
    menuMetrics,
    rendererErrors
  }, null, 2)}\n`, 'utf8');

  widgetWindow.destroy();
  windowService.stopWidgetWindowEvents();
  database.closeDatabase();
}

run()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error('[notes-visual] 捕获失败：', error);
    BrowserWindow.getAllWindows().forEach((window) => window.destroy());
    app.exit(1);
  });
