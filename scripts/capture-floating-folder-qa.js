process.env.DWM_DISABLE_DESKTOP_ATTACHMENT = '1';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow, dialog, shell } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output', 'qa', 'floating-folder-visual');
const userDataPath = path.join(outputRoot, 'user-data');
const fixturePath = path.join(outputRoot, 'folder-fixture');
const sizes = {
  compact: { width: 260, height: 180 },
  comfortable: { width: 340, height: 300 },
  large: { width: 420, height: 420 }
};
const themes = ['light', 'dark', 'glass'];
const rendererErrors = [];

function prepare() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  fs.mkdirSync(fixturePath, { recursive: true });
  fs.writeFileSync(path.join(fixturePath, 'alpha.txt'), 'alpha', 'utf8');
  fs.writeFileSync(path.join(fixturePath, 'beta.md'), '# beta\n', 'utf8');
  fs.writeFileSync(path.join(fixturePath, 'product-plan.pdf'), 'pdf fixture', 'utf8');
  fs.mkdirSync(path.join(fixturePath, 'nested'), { recursive: true });
}

function wait(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitFor(check, message, timeout = 6000) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeout) {
    try {
      if (await check()) return;
    } catch (error) {
      // Keep polling while the renderer settles.
    }

    await wait(50);
  }

  throw new Error(message);
}

function waitForLoad(browserWindow) {
  if (!browserWindow.webContents.isLoading()) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('页面加载超时。')), 6000);

    browserWindow.webContents.once('did-finish-load', () => {
      clearTimeout(timer);
      resolve();
    });
    browserWindow.webContents.once('did-fail-load', (event, code, description, url, isMainFrame) => {
      if (!isMainFrame) return;
      clearTimeout(timer);
      reject(new Error(`页面加载失败：${code} ${description}`));
    });
  });
}

async function registerApplicationIpc() {
  const {
    applyThemeToAllWidgetWindows,
    closeWidgetWindow,
    createWidgetWindow,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  } = require('../electron/services/widgetWindowService');
  const { registerConfigIpc } = require('../electron/ipc/configIpc');
  const { registerDesktopFileIpc } = require('../electron/ipc/desktopFileIpc');
  const { registerFileIpc } = require('../electron/ipc/fileIpc');
  const { registerScheduleIpc } = require('../electron/ipc/scheduleIpc');
  const { registerTodoIpc } = require('../electron/ipc/todoIpc');
  const { registerWeatherIpc } = require('../electron/ipc/weatherIpc');
  const { registerWidgetIpc } = require('../electron/ipc/widgetIpc');

  registerConfigIpc({ applyThemeToAllWidgetWindows });
  registerDesktopFileIpc();
  registerWidgetIpc({
    closeWidgetWindow,
    createWidgetWindow,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  });
  registerTodoIpc();
  registerScheduleIpc();
  registerWeatherIpc();
  registerFileIpc();

  return { createWidgetWindow, closeWidgetWindow };
}

function attachDiagnostics(browserWindow, label) {
  browserWindow.webContents.on('console-message', (event, detailsOrLevel, message) => {
    const details = typeof detailsOrLevel === 'object' ? detailsOrLevel : { level: detailsOrLevel, message };
    if (Number(details.level) >= 2) {
      rendererErrors.push({ window: label, message: details.message || '' });
    }
  });
  browserWindow.webContents.on('render-process-gone', (event, details) => {
    rendererErrors.push({ window: label, message: `渲染进程退出：${details.reason}` });
  });
}

async function captureCombo(widgetService, widgetWindowService, configService, theme, sizeKey) {
  const size = sizes[sizeKey];

  configService.updateConfig({
    ...configService.getConfig(),
    theme,
    globalOpacity: 0.92,
    borderRadius: 24,
    fontSize: 16,
    shadow: true
  });

  const widget = widgetService.createWidget({
    type: 'floatingFolder',
    name: '快捷收纳区'
  });

  configService.updateWidgetConfig(String(widget.id), {
    width: size.width,
    height: size.height,
    pinned: true,
    opacity: 1,
    floatingFolder: {
      addedFilePaths: [
        path.join(fixturePath, 'alpha.txt'),
        path.join(fixturePath, 'beta.md'),
        path.join(fixturePath, 'product-plan.pdf'),
        path.join(fixturePath, 'nested')
      ],
      zoneOrders: {},
      activeZoneId: 'home'
    }
  });

  const widgetWindow = widgetWindowService.createWidgetWindow(widget);
  attachDiagnostics(widgetWindow, `${theme}-${sizeKey}`);
  await waitForLoad(widgetWindow);
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "document.querySelectorAll('[data-file-index]').length >= 4"
    ),
    `${theme}-${sizeKey} 文件未渲染`
  );
  await wait(220);

  const metrics = await widgetWindow.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.floating-folder-widget');
    const surface = document.querySelector('.ff-app-surface');
    const grid = document.querySelector('#floating-folder-grid');
    const popover = document.querySelector('#floating-folder-settings-panel');
    const bounds = root.getBoundingClientRect();
    const surfaceBounds = surface.getBoundingClientRect();
    const hasOverflowX = document.documentElement.scrollWidth > window.innerWidth || document.body.scrollWidth > window.innerWidth;
    const hasOverflowY = document.documentElement.scrollHeight > window.innerHeight || document.body.scrollHeight > window.innerHeight;
    return {
      width: Math.round(window.innerWidth),
      height: Math.round(window.innerHeight),
      rootWidth: Math.round(bounds.width),
      rootHeight: Math.round(bounds.height),
      surfaceHeight: Math.round(surfaceBounds.height),
      renderedItems: grid.querySelectorAll('[data-file-index]').length,
      settingsVisible: popover && !popover.hidden,
      hasOverflowX,
      hasOverflowY
    };
  })()`);

  const outputPath = path.join(outputRoot, `${theme}-${sizeKey}-floatingFolder.png`);
  fs.writeFileSync(outputPath, (await widgetWindow.capturePage()).toPNG());
  let settingsOutputPath = '';
  let moreMenuOutputPath = '';
  let controlSeparationMetrics = null;
  let controlSeparationPassed = true;
  let zonePickerOutputPath = '';
  let zonePickerMetrics = null;
  let zonePickerPassed = true;
  if (theme === 'light' && sizeKey === 'compact') {
    await widgetWindow.webContents.executeJavaScript(
      "document.querySelector('[data-action=\"new-zone\"]')?.click()"
    );
    await wait(80);
    zonePickerMetrics = await widgetWindow.webContents.executeJavaScript(`(() => {
      const form = document.querySelector('#floating-folder-zone-form');
      const rect = form.getBoundingClientRect();
      return {
        visible: !form.hidden,
        options: form.querySelectorAll('[data-zone-icon]').length,
        insideViewport: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        hasOverflowX: document.documentElement.scrollWidth > innerWidth,
        hasOverflowY: document.documentElement.scrollHeight > innerHeight
      };
    })()`);
    zonePickerPassed = zonePickerMetrics.visible
      && zonePickerMetrics.options === 12
      && zonePickerMetrics.insideViewport
      && !zonePickerMetrics.hasOverflowX
      && !zonePickerMetrics.hasOverflowY;
    zonePickerOutputPath = path.join(outputRoot, 'light-compact-zone-picker.png');
    fs.writeFileSync(zonePickerOutputPath, (await widgetWindow.capturePage()).toPNG());
    await widgetWindow.webContents.executeJavaScript(
      "document.querySelector('#floating-folder-cancel-zone')?.click()"
    );
  }
  if (sizeKey === 'large') {
    await widgetWindow.webContents.executeJavaScript(
      "document.querySelector('#floating-folder-settings-btn')?.click()"
    );
    await wait(80);
    settingsOutputPath = path.join(outputRoot, `${theme}-${sizeKey}-settings.png`);
    fs.writeFileSync(settingsOutputPath, (await widgetWindow.capturePage()).toPNG());

    if (theme === 'light') {
      controlSeparationMetrics = await widgetWindow.webContents.executeJavaScript(`(() => {
        const settings = document.querySelector('#floating-folder-settings-panel');
        const opacity = document.querySelector('#floating-folder-opacity');
        return {
          settingsVisible: Boolean(settings && !settings.hidden),
          hasWindowModeControls: Boolean(document.querySelector('#floating-folder-window-mode-controls')),
          hasSizePresetControls: Boolean(document.querySelector('#floating-folder-size-controls')),
          opacityValue: opacity?.value || '',
          opacityOutput: document.querySelector('#floating-folder-opacity-output')?.textContent || ''
        };
      })()`);

      await widgetWindow.webContents.executeJavaScript(
        "document.querySelector('#floating-folder-settings-btn')?.click(); document.querySelector('#floating-folder-more-btn')?.click()"
      );
      await wait(80);
      const moreMenuActions = await widgetWindow.webContents.executeJavaScript(
        "[...document.querySelectorAll('#floating-folder-more-menu [data-action]')].map((item) => item.dataset.action)"
      );
      moreMenuOutputPath = path.join(outputRoot, 'light-large-more-menu.png');
      fs.writeFileSync(moreMenuOutputPath, (await widgetWindow.capturePage()).toPNG());

      // Trigger the actual slider path before reading the BrowserWindow opacity.
      await widgetWindow.webContents.executeJavaScript(`(() => {
        const opacity = document.querySelector('#floating-folder-opacity');
        opacity.value = '100';
        opacity.dispatchEvent(new Event('input', { bubbles: true }));
      })()`);
      await wait(120);
      controlSeparationMetrics.moreMenuActions = moreMenuActions;
      controlSeparationMetrics.windowOpacityAt100 = widgetWindow.getOpacity();
      controlSeparationPassed = controlSeparationMetrics.settingsVisible
        && controlSeparationMetrics.hasWindowModeControls
        && !controlSeparationMetrics.hasSizePresetControls
        && controlSeparationMetrics.opacityValue === '100'
        && controlSeparationMetrics.opacityOutput === '100%'
        && controlSeparationMetrics.windowOpacityAt100 === 1
        && JSON.stringify(moreMenuActions) === JSON.stringify([
          'add-items',
          'new-zone',
          'manage-zones',
          'detach-zone',
          'sort-zone',
          'compact',
          'reset'
        ]);
    }
  }
  widgetWindow.hide();

  return {
    theme,
    size: sizeKey,
    outputPath,
    settingsOutputPath,
    moreMenuOutputPath,
    controlSeparationMetrics,
    controlSeparationPassed,
    zonePickerOutputPath,
    zonePickerMetrics,
    zonePickerPassed,
    metrics
  };
}

async function captureDetachedEmpty(widgetService, widgetWindowService, configService) {
  configService.updateConfig({
    ...configService.getConfig(),
    theme: 'light',
    globalOpacity: 0.92,
    borderRadius: 24,
    fontSize: 16,
    shadow: true
  });

  const widget = widgetService.createWidget({
    type: 'floatingFolder',
    name: '开发'
  });
  configService.updateWidgetConfig(String(widget.id), {
    width: 340,
    height: 300,
    pinned: true,
    opacity: 1,
    floatingFolderDetachedZoneId: 'develop',
    floatingFolder: {
      zones: [{ id: 'develop', name: '开发', custom: false }],
      zoneOrders: { develop: [] },
      activeZoneId: 'develop',
      addedFilePaths: [],
      removedFilePaths: [],
      showHint: false
    }
  });

  const widgetWindow = widgetWindowService.createWidgetWindow(widget);
  attachDiagnostics(widgetWindow, 'light-detached-empty');
  await waitForLoad(widgetWindow);
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "Boolean(document.body.classList.contains('ff-detached-zone') && document.querySelector('#floating-folder-empty') && !document.querySelector('#floating-folder-empty').hidden)"
    ),
    '独立空分区未完成渲染'
  );
  widgetWindow.showInactive();
  await wait(120);

  const metrics = await widgetWindow.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.floating-folder-widget');
    const title = document.querySelector('#floating-folder-title');
    const surface = document.querySelector('.ff-app-surface');
    const empty = document.querySelector('#floating-folder-empty');
    const strong = empty.querySelector('strong');
    const description = empty.querySelector('span');
    const surfaceRect = surface.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      title: title.textContent,
      titleClipped: title.scrollWidth > title.clientWidth,
      tabsHidden: document.querySelector('#floating-folder-zone-tabs').hidden,
      gridRows: getComputedStyle(root).gridTemplateRows.split(' ').length,
      surfaceHeight: Math.round(surfaceRect.height),
      emptyTitle: strong.textContent,
      description: description.textContent,
      emptyContentInsideSurface: descriptionRect.bottom <= surfaceRect.bottom && descriptionRect.left >= surfaceRect.left,
      hasOverflowX: document.documentElement.scrollWidth > window.innerWidth,
      hasOverflowY: document.documentElement.scrollHeight > window.innerHeight
    };
  })()`);
  const passed = metrics.title === '开发'
    && !metrics.titleClipped
    && metrics.tabsHidden
    && metrics.gridRows === 2
    && metrics.surfaceHeight >= 220
    && metrics.emptyContentInsideSurface
    && !metrics.hasOverflowX
    && !metrics.hasOverflowY;
  const outputPath = path.join(outputRoot, 'light-detached-empty.png');
  fs.writeFileSync(outputPath, (await widgetWindow.capturePage()).toPNG());
  widgetWindow.hide();

  return { outputPath, metrics, passed };
}

async function captureMainEmpty(widgetService, widgetWindowService, configService) {
  configService.updateConfig({
    ...configService.getConfig(),
    theme: 'light',
    globalOpacity: 0.92,
    borderRadius: 24,
    fontSize: 16,
    shadow: true
  });

  const widget = widgetService.createWidget({
    type: 'floatingFolder',
    name: '快捷收纳区'
  });
  configService.updateWidgetConfig(String(widget.id), {
    width: 420,
    height: 420,
    pinned: true,
    opacity: 1,
    floatingFolder: {
      addedFilePaths: [],
      removedFilePaths: [],
      zoneOrders: {},
      activeZoneId: 'home',
      showHint: false
    }
  });

  const widgetWindow = widgetWindowService.createWidgetWindow(widget);
  attachDiagnostics(widgetWindow, 'light-large-empty');
  await waitForLoad(widgetWindow);
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "Boolean(document.querySelector('#floating-folder-empty') && !document.querySelector('#floating-folder-empty').hidden && document.querySelectorAll('.ff-zone-icon').length === 4)"
    ),
    '主收纳区空状态未完成渲染'
  );
  widgetWindow.showInactive();
  await wait(160);

  const metrics = await widgetWindow.webContents.executeJavaScript(`(() => {
    const card = document.querySelector('.widget-card');
    const surface = document.querySelector('.ff-app-surface');
    const empty = document.querySelector('#floating-folder-empty');
    const illustration = empty.querySelector('.ff-empty-illustration');
    const strong = empty.querySelector('strong');
    const description = empty.querySelector('span');
    const cardStyle = getComputedStyle(card);
    const cardRect = card.getBoundingClientRect();
    const surfaceRect = surface.getBoundingClientRect();
    const descriptionRect = description.getBoundingClientRect();
    return {
      width: window.innerWidth,
      height: window.innerHeight,
      cardWidth: Math.round(cardRect.width),
      cardHeight: Math.round(cardRect.height),
      borderRadius: cardStyle.borderRadius,
      titleMarkLoaded: document.querySelector('.ff-title-mark')?.complete === true,
      illustrationLoaded: illustration?.complete === true,
      illustrationWidth: Math.round(illustration.getBoundingClientRect().width),
      zoneIcons: document.querySelectorAll('.ff-zone-icon').length,
      title: strong.textContent,
      description: description.textContent,
      emptyContentInsideSurface: descriptionRect.bottom <= surfaceRect.bottom && descriptionRect.left >= surfaceRect.left,
      hasOverflowX: document.documentElement.scrollWidth > window.innerWidth,
      hasOverflowY: document.documentElement.scrollHeight > window.innerHeight
    };
  })()`);
  const passed = metrics.borderRadius === '24px'
    && metrics.titleMarkLoaded
    && metrics.illustrationLoaded
    && metrics.illustrationWidth >= 120
    && metrics.zoneIcons === 4
    && metrics.title === '拖入常用文件或应用'
    && metrics.description === '支持文件、文件夹和应用；这里只保存快捷引用。'
    && metrics.emptyContentInsideSurface
    && !metrics.hasOverflowX
    && !metrics.hasOverflowY;
  const outputPath = path.join(outputRoot, 'light-large-empty.png');
  fs.writeFileSync(outputPath, (await widgetWindow.capturePage()).toPNG());

  await widgetWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-action="new-zone"]').click();
    document.querySelector('[data-zone-icon="travel"]').click();
  })()`);
  await wait(100);
  const pickerMetrics = await widgetWindow.webContents.executeJavaScript(`(() => {
    const form = document.querySelector('#floating-folder-zone-form');
    const formRect = form.getBoundingClientRect();
    const selected = form.querySelector('[data-zone-icon][aria-pressed="true"]');
    const travelIcon = form.querySelector('[data-zone-icon="travel"] .ff-zone-picker-art');
    return {
      visible: !form.hidden,
      options: form.querySelectorAll('[data-zone-icon]').length,
      selected: selected?.dataset.zoneIcon || '',
      iconLoaded: travelIcon instanceof HTMLImageElement && travelIcon.complete && travelIcon.naturalWidth > 0,
      insideViewport: formRect.left >= 0 && formRect.top >= 0 && formRect.right <= innerWidth && formRect.bottom <= innerHeight,
      hasOverflowX: document.documentElement.scrollWidth > innerWidth,
      hasOverflowY: document.documentElement.scrollHeight > innerHeight
    };
  })()`);
  const pickerOutputPath = path.join(outputRoot, 'light-large-zone-picker.png');
  fs.writeFileSync(pickerOutputPath, (await widgetWindow.capturePage()).toPNG());
  const pickerPassed = pickerMetrics.visible
    && pickerMetrics.options === 12
    && pickerMetrics.selected === 'travel'
    && pickerMetrics.iconLoaded
    && pickerMetrics.insideViewport
    && !pickerMetrics.hasOverflowX
    && !pickerMetrics.hasOverflowY;
  widgetWindow.hide();

  return { outputPath, pickerOutputPath, metrics, pickerMetrics, passed: passed && pickerPassed };
}

async function main() {
  prepare();
  app.setPath('userData', userDataPath);
  app.commandLine.appendSwitch('disable-gpu');
  app.on('window-all-closed', (event) => {
    event.preventDefault();
  });
  await app.whenReady();

  const database = require('../electron/db/database');
  const widgetService = require('../electron/services/widgetService');
  const configService = require('../electron/services/configService');

  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [fixturePath] });
  shell.openPath = async () => '';

  await database.initializeDatabase();
  const widgetWindowService = await registerApplicationIpc();
  const captures = [];

  for (const theme of themes) {
    for (const sizeKey of Object.keys(sizes)) {
      captures.push(await captureCombo(widgetService, widgetWindowService, configService, theme, sizeKey));
      await wait(120);
    }
  }

  const mainEmptyCapture = await captureMainEmpty(widgetService, widgetWindowService, configService);
  const detachedCapture = await captureDetachedEmpty(widgetService, widgetWindowService, configService);

  const captureFailed = captures.some((capture) => capture.metrics.hasOverflowX
    || capture.metrics.hasOverflowY
    || capture.zonePickerPassed === false
    || capture.controlSeparationPassed === false);
  const report = {
    finalResult: rendererErrors.length || captureFailed || !mainEmptyCapture.passed || !detachedCapture.passed ? 'failed' : 'passed',
    rendererErrors,
    captures,
    mainEmptyCapture,
    detachedCapture
  };

  fs.writeFileSync(path.join(outputRoot, 'report.json'), JSON.stringify(report, null, 2), 'utf8');
  BrowserWindow.getAllWindows().forEach((browserWindow) => {
    if (!browserWindow.isDestroyed()) browserWindow.destroy();
  });
  app.quit();
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
