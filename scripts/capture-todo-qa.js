process.env.DWM_DISABLE_DESKTOP_ATTACHMENT = '1';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output', 'qa', 'todo-redesign');
const userDataPath = path.join(outputRoot, 'user-data');
const screenshotPath = path.join(outputRoot, 'implementation.png');
const settingsScreenshotPath = path.join(outputRoot, 'settings-control.png');
const moreMenuScreenshotPath = path.join(outputRoot, 'more-menu.png');
const compactScreenshotPath = path.join(outputRoot, 'implementation-compact.png');

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check, message, timeout = 6000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    try {
      if (await check()) {
        return;
      }
    } catch (error) {
      // The page can briefly reload while the widget is being created.
    }

    await wait(50);
  }

  throw new Error(message);
}

function formatLocalDateTime(offsetDays, hours, minutes) {
  const date = new Date();
  const pad = (value) => String(value).padStart(2, '0');

  date.setDate(date.getDate() + offsetDays);
  date.setHours(hours, minutes, 0, 0);

  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(hours)}:${pad(minutes)}`;
}

async function registerApplicationIpc() {
  const {
    applyThemeToAllWidgetWindows,
    broadcastWidgetEvent,
    closeWidgetWindow,
    createWidgetWindow,
    getWidgetWindowMode,
    setWidgetWindowMode,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  } = require('../electron/services/widgetWindowService');
  const { registerConfigIpc } = require('../electron/ipc/configIpc');
  const { registerTodoIpc } = require('../electron/ipc/todoIpc');
  const { registerWidgetIpc } = require('../electron/ipc/widgetIpc');

  registerConfigIpc({ applyThemeToAllWidgetWindows });
  registerWidgetIpc({
    closeWidgetWindow,
    createWidgetWindow,
    getWidgetWindowMode,
    setWidgetWindowMode,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  });
  registerTodoIpc({ broadcastWidgetEvent });

  return { createWidgetWindow };
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  app.commandLine.appendSwitch('disable-gpu');
  await app.whenReady();

  const database = require('../electron/db/database');
  const configService = require('../electron/services/configService');
  const todoService = require('../electron/services/todoService');
  const widgetService = require('../electron/services/widgetService');
  const widgetWindowService = await registerApplicationIpc();

  await database.initializeDatabase();
  configService.updateConfig({
    ...configService.getConfig(),
    theme: 'light',
    globalOpacity: 0.96,
    borderRadius: 24,
    fontSize: 16,
    shadow: true
  });

  const samples = [
    { title: '学习', content: '', priority: 'medium', dueTime: '', completed: false }
  ];

  samples.forEach((sample) => {
    const todo = todoService.createTodo(sample);

    if (sample.completed) {
      todoService.updateTodoCompleted(todo.id, true);
    }
  });

  const widget = widgetService.createWidget({
    type: 'todo',
    name: '今日待办'
  });

  configService.updateWidgetConfig(String(widget.id), {
    width: 620,
    height: 560,
    pinned: false,
    locked: false,
    opacity: 1
  });

  const widgetWindow = widgetWindowService.createWidgetWindow(widget);
  const rendererErrors = [];

  widgetWindow.webContents.on('console-message', (event, detailsOrLevel, message) => {
    const details = typeof detailsOrLevel === 'object' ? detailsOrLevel : { level: detailsOrLevel, message };

    if (Number(details.level) >= 2) {
      rendererErrors.push(details.message || 'unknown renderer error');
    }
  });
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "document.querySelectorAll('.todo-item').length === 1 && document.querySelector('#todo-progress-copy').textContent === '0/1 已完成'"
    ),
    '待办组件未完成渲染。'
  );
  await wait(180);

  widgetWindow.showInactive();
  await wait(120);
  fs.writeFileSync(screenshotPath, (await widgetWindow.capturePage()).toPNG());

  const interactionResults = await widgetWindow.webContents.executeJavaScript(`(async () => {
    const pause = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));
    const required = (selector) => {
      const element = document.querySelector(selector);

      if (!element) throw new Error('missing element: ' + selector);
      return element;
    };
    const waitForDom = async (check, timeout = 2500) => {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeout) {
        if (check()) return;
        await pause(30);
      }

      throw new Error('renderer interaction timed out');
    };
    const addTodo = async ({ title, content = '', priority = 'medium', dueTime = '' }) => {
      const previousCount = document.querySelectorAll('.todo-item').length;
      required('[data-todo-status-filter="all"]').click();
      required('[data-todo-date-filter="all"]').click();
      required('#todo-title').value = title;
      required('#todo-content').value = content;
      required('#todo-priority').value = priority;
      required('#todo-due-time').value = dueTime;
      required('#todo-form').requestSubmit();
      await waitForDom(() => document.querySelectorAll('.todo-item').length === previousCount + 1);
    };

    await addTodo({ title: '今天的任务', priority: 'low', dueTime: '${formatLocalDateTime(0, 14, 30)}' });
    await addTodo({ title: '明天的任务', content: '验证日期筛选', priority: 'high', dueTime: '${formatLocalDateTime(1, 9, 30)}' });

    const firstCheckbox = document.querySelector('[data-toggle-todo-id]');
    firstCheckbox.click();
    await waitForDom(() => document.querySelector('#todo-progress-copy').textContent === '1/3 已完成');

    const completedButton = document.querySelector('[data-todo-status-filter="completed"]');
    completedButton.click();
    await pause(30);
    const completedVisible = document.querySelectorAll('.todo-item').length;
    document.querySelector('[data-todo-status-filter="all"]').click();

    document.querySelector('[data-todo-date-filter="today"]').click();
    await pause(30);
    const todayVisible = document.querySelectorAll('.todo-item').length;
    document.querySelector('[data-todo-date-filter="all"]').click();

    const originalEditButton = document.querySelector('[data-edit-todo-id]');
    originalEditButton.click();
    document.querySelector('#todo-title').value = '学习（已编辑）';
    document.querySelector('#todo-form').requestSubmit();
    await waitForDom(() => [...document.querySelectorAll('.todo-main strong')].some((node) => node.textContent === '学习（已编辑）'));
    const editWorked = true;

    const originalConfirm = window.confirm;
    window.confirm = () => true;
    document.querySelectorAll('[data-delete-todo-id]')[1].click();
    await waitForDom(() => document.querySelectorAll('.todo-item').length === 2);
    window.confirm = originalConfirm;
    const deleteWorked = true;

    for (let index = 1; index <= 7; index += 1) {
      await addTodo({ title: '滚动测试任务 ' + index, priority: index % 2 ? 'medium' : 'low' });
    }

    const pinButton = document.querySelector('#pin-widget-btn');
    const pinInitialState = pinButton.getAttribute('aria-pressed');
    pinButton.click();
    await pause(80);
    const pinToggled = pinButton.getAttribute('aria-pressed') !== pinInitialState;
    pinButton.click();
    await pause(80);

    document.dispatchEvent(new MouseEvent('contextmenu', {
      bubbles: true,
      cancelable: true,
      clientX: 180,
      clientY: 210,
      button: 2
    }));
    window.dispatchEvent(new CustomEvent('widget-context-menu-requested', {
      detail: { x: 180, y: 210 }
    }));
    await pause(60);
    const contextMenuSuppressed = !document.querySelector('#widget-context-menu')
      && !document.querySelector('#widget-settings-popover');

    document.querySelector('#more-widget-btn').click();
    await pause(40);
    const moreMenuVisible = Boolean(document.querySelector('#widget-context-menu'));
    const moreMenuActions = [...document.querySelectorAll('#widget-context-menu [data-menu-action]')]
      .map((button) => button.dataset.menuAction);
    const moreMenuHasDisplaySettings = moreMenuActions.some((action) => (
      action === 'settings'
      || action === 'toggle-locked'
      || action.startsWith('size:')
      || action.startsWith('opacity:')
      || action.startsWith('mode:')
    ));
    document.querySelector('#more-widget-btn').click();
    await pause(30);

    let settingsError = '';
    const captureSettingsError = (event) => {
      settingsError = event.reason?.stack || event.reason?.message || String(event.reason || 'unknown settings error');
    };
    window.addEventListener('unhandledrejection', captureSettingsError);
    document.querySelector('#settings-widget-btn').click();
    await pause(40);
    const opacityRange = document.querySelector('[data-settings-opacity]');
    const settingsVisible = Boolean(opacityRange);
    window.removeEventListener('unhandledrejection', captureSettingsError);
    if (!opacityRange) throw new Error('settings popover did not open: ' + settingsError);
    opacityRange.value = '0.65';
    opacityRange.dispatchEvent(new Event('input', { bubbles: true }));
    await pause(180);
    const opacityOutput = document.querySelector('[data-settings-opacity-output]')?.textContent;
    const bodyStyle = getComputedStyle(document.body);

    const list = document.querySelector('#todo-list');
    const root = document.querySelector('.todo-widget');
    const addRow = document.querySelector('.todo-add-row');
    const titleInput = document.querySelector('#todo-title');
    const submitButton = document.querySelector('#todo-submit-btn');
    return {
      completedVisible,
      todayVisible,
      editWorked,
      deleteWorked,
      pinToggled,
      contextMenuSuppressed,
      moreMenuVisible,
      moreMenuActions,
      moreMenuHasDisplaySettings,
      settingsVisible,
      opacityOutput,
      roundedClipApplied: bodyStyle.clipPath !== 'none' && bodyStyle.borderRadius !== '0px',
      listScrollable: list.scrollHeight > list.clientHeight,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth && root.scrollWidth <= root.clientWidth,
      viewport: { width: innerWidth, height: innerHeight },
      primaryFormLayout: {
        columns: getComputedStyle(addRow).gridTemplateColumns,
        inputWidth: Math.round(titleInput.getBoundingClientRect().width),
        buttonWidth: Math.round(submitButton.getBoundingClientRect().width),
        sameRow: Math.abs(titleInput.getBoundingClientRect().top - submitButton.getBoundingClientRect().top) < 2
      }
    };
  })()`);

  fs.writeFileSync(settingsScreenshotPath, (await widgetWindow.capturePage()).toPNG());
  interactionResults.windowOpacityAt65 = widgetWindow.getOpacity();
  interactionResults.opacitySaved = Number(
    configService.getConfig().widgets[String(widget.id)]?.opacity
  ) === 0.65;

  await widgetWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-settings-close]')?.click();
    document.querySelector('#more-widget-btn')?.click();
  })()`);
  await wait(80);
  fs.writeFileSync(moreMenuScreenshotPath, (await widgetWindow.capturePage()).toPNG());

  await widgetWindow.webContents.executeJavaScript(`(async () => {
    document.querySelector('#more-widget-btn')?.click();
    document.querySelector('#settings-widget-btn')?.click();
    await new Promise((resolve) => setTimeout(resolve, 40));
    const range = document.querySelector('[data-settings-opacity]');
    range.value = '1';
    range.dispatchEvent(new Event('input', { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 180));
    document.querySelector('[data-settings-close]').click();
  })()`);
  await wait(80);
  interactionResults.windowOpacityAt100 = widgetWindow.getOpacity();

  widgetWindow.setSize(420, 420);
  await wait(180);
  interactionResults.compactWindow = await widgetWindow.webContents.executeJavaScript(`(() => {
    const bodyStyle = getComputedStyle(document.body);
    const cardStyle = getComputedStyle(document.querySelector('.widget-card'));
    return {
      viewport: { width: innerWidth, height: innerHeight },
      bodyRadius: bodyStyle.borderRadius,
      cardRadius: cardStyle.borderRadius,
      clipPath: bodyStyle.clipPath,
      noHorizontalOverflow: document.documentElement.scrollWidth <= innerWidth
    };
  })()`);
  fs.writeFileSync(compactScreenshotPath, (await widgetWindow.capturePage()).toPNG());

  const passed = rendererErrors.length === 0
    && interactionResults.completedVisible === 1
    && interactionResults.todayVisible === 1
    && interactionResults.editWorked
    && interactionResults.deleteWorked
    && interactionResults.pinToggled
    && interactionResults.contextMenuSuppressed
    && interactionResults.moreMenuVisible
    && JSON.stringify(interactionResults.moreMenuActions) === JSON.stringify(['edit', 'hide', 'delete'])
    && !interactionResults.moreMenuHasDisplaySettings
    && interactionResults.settingsVisible
    && interactionResults.opacityOutput === '65%'
    && interactionResults.opacitySaved
    && Math.abs(interactionResults.windowOpacityAt65 - 0.65) < 0.03
    && interactionResults.windowOpacityAt100 === 1
    && interactionResults.roundedClipApplied
    && interactionResults.compactWindow.noHorizontalOverflow
    && interactionResults.listScrollable
    && interactionResults.noHorizontalOverflow;
  const report = {
    finalResult: passed ? 'passed' : 'failed',
    screenshotPath,
    settingsScreenshotPath,
    moreMenuScreenshotPath,
    compactScreenshotPath,
    interactionResults,
    rendererErrors
  };

  fs.writeFileSync(path.join(outputRoot, 'report.json'), `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  BrowserWindow.getAllWindows().forEach((browserWindow) => {
    if (!browserWindow.isDestroyed()) {
      browserWindow.destroy();
    }
  });
  database.closeDatabase();
  app.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
