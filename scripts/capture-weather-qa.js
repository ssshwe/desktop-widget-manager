process.env.DWM_DISABLE_DESKTOP_ATTACHMENT = '1';

const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output', 'qa', 'weather-reference');
const userDataPath = path.join(outputRoot, 'user-data');
const comfortableScreenshotPath = path.join(outputRoot, 'implementation-320x300.png');
const compactScreenshotPath = path.join(outputRoot, 'implementation-260x180.png');
const reportPath = path.join(outputRoot, 'layout-results.json');

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
      // A widget can briefly reload while its configuration is being applied.
    }

    await wait(50);
  }

  throw new Error(message);
}

function registerApplicationIpc() {
  const {
    applyThemeToAllWidgetWindows,
    closeWidgetWindow,
    createWidgetWindow,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  } = require('../electron/services/widgetWindowService');
  const { registerConfigIpc } = require('../electron/ipc/configIpc');
  const { registerWeatherIpc } = require('../electron/ipc/weatherIpc');
  const { registerWidgetIpc } = require('../electron/ipc/widgetIpc');

  registerConfigIpc({ applyThemeToAllWidgetWindows });
  registerWidgetIpc({
    closeWidgetWindow,
    createWidgetWindow,
    updateWidgetWindowConfig,
    updateWidgetWindowMetadata
  });
  registerWeatherIpc();

  return { createWidgetWindow, updateWidgetWindowConfig };
}

async function inspectLayout(widgetWindow) {
  return widgetWindow.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.weather-widget');
    const bodyStyle = getComputedStyle(document.body);
    const card = document.querySelector('.widget-card');
    const cardStyle = getComputedStyle(card);
    const cardAfterStyle = getComputedStyle(card, '::after');
    const normalizedShadows = cardStyle.boxShadow.replace(/rgba?\\([^)]*\\)/g, 'color');
    const metricCards = [...document.querySelectorAll('.weather-metric-card')];
    const controls = [
      document.querySelector('.weather-city-control'),
      document.querySelector('#weather-location-btn'),
      document.querySelector('.weather-save-button'),
      document.querySelector('#weather-refresh-btn')
    ].filter((element) => element && getComputedStyle(element).display !== 'none');
    const rectsOverlap = (a, b) => (
      a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top
    );
    const contentElements = [
      document.querySelector('.weather-temp-panel'),
      document.querySelector('.weather-sky-object'),
      ...metricCards,
      ...controls
    ].filter(Boolean);
    const overlappingPairs = [];

    contentElements.forEach((element, index) => {
      contentElements.slice(index + 1).forEach((other) => {
        if (rectsOverlap(element.getBoundingClientRect(), other.getBoundingClientRect())) {
          const sameMetric = element.closest('.weather-metric-card') === other.closest('.weather-metric-card');
          const sameControl = element.closest('.weather-city-control') === other.closest('.weather-city-control');

          if (!sameMetric && !sameControl) {
            overlappingPairs.push([element.className, other.className]);
          }
        }
      });
    });

    const metricHeights = metricCards.map((card) => Math.round(card.getBoundingClientRect().height * 10) / 10);
    const controlHeights = controls.map((control) => Math.round(control.getBoundingClientRect().height * 10) / 10);
    const rootRect = root.getBoundingClientRect();
    const elementsInsideRoot = contentElements.every((element) => {
      const rect = element.getBoundingClientRect();
      return rect.left >= rootRect.left - 0.5
        && rect.right <= rootRect.right + 0.5
        && rect.top >= rootRect.top - 0.5
        && rect.bottom <= rootRect.bottom + 0.5;
    });

    return {
      viewport: { width: innerWidth, height: innerHeight },
      noDocumentOverflow: document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= innerHeight,
      noWidgetOverflow: root.scrollWidth <= root.clientWidth && root.scrollHeight <= root.clientHeight,
      elementsInsideRoot,
      overlappingPairs,
      metricHeights,
      equalMetricHeights: new Set(metricHeights).size === 1,
      controlHeights,
      equalControlHeights: new Set(controlHeights).size === 1,
      title: document.querySelector('#widget-type-label')?.textContent,
      city: document.querySelector('#weather-city-name')?.textContent,
      currentTemperature: document.querySelector('#weather-current-temp')?.textContent,
      metrics: metricCards.map((card) => card.innerText.trim()),
      hasBackdropFilter: cardStyle.backdropFilter !== 'none',
      bodyClipPath: bodyStyle.clipPath,
      cardClipPath: cardStyle.clipPath,
      cardBorderRadius: cardStyle.borderRadius,
      realRoundedClip: bodyStyle.clipPath !== 'none'
        && cardStyle.clipPath !== 'none'
        && bodyStyle.borderRadius !== '0px'
        && cardStyle.borderRadius !== '0px',
      noOuterShadow: cardStyle.boxShadow === 'none'
        || normalizedShadows.split(',').every((shadow) => shadow.includes('inset')),
      duplicateBorderHidden: cardAfterStyle.display === 'none',
      fullyOpaque: document.body.classList.contains('is-fully-opaque')
    };
  })()`);
}

async function main() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  app.commandLine.appendSwitch('disable-gpu');
  await app.whenReady();

  const database = require('../electron/db/database');
  const configService = require('../electron/services/configService');
  const weatherService = require('../electron/services/weatherService');
  const widgetService = require('../electron/services/widgetService');
  const widgetWindowService = registerApplicationIpc();

  await database.initializeDatabase();
  configService.updateConfig({
    ...configService.getConfig(),
    theme: 'glass',
    globalOpacity: 0.96,
    borderRadius: 28,
    fontSize: 16,
    shadow: true
  });
  await weatherService.updateWeatherCity('北京');

  const widget = widgetService.createWidget({
    type: 'weather',
    name: '天气小组件'
  });

  configService.updateWidgetConfig(String(widget.id), {
    width: 320,
    height: 300,
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
      "document.querySelector('#weather-city-name')?.textContent === '北京'"
    ),
    '天气组件未完成渲染。'
  );

  await widgetWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('#weather-current-temp').innerHTML = '27<span class="weather-temp-unit">°C</span>';
    document.querySelector('#weather-high-temp').textContent = '31°C';
    document.querySelector('#weather-low-temp').textContent = '24°C';
    document.querySelector('#weather-air-quality').textContent = '优';
    document.querySelector('#weather-condition').textContent = '晴';
    document.querySelector('#weather-source').textContent = '实时数据';
    document.querySelector('#weather-updated-at').textContent = '更新：刚刚';
  })()`);
  await widgetWindowService.updateWidgetWindowConfig(widget.id, { opacity: 0.8 });
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "document.body.classList.contains('is-fully-opaque') === false"
    ),
    '天气组件降低透明度后未退出不透明模式。'
  );
  const partialWidgetWindowOpacity = widgetWindow.getOpacity();
  await widgetWindowService.updateWidgetWindowConfig(widget.id, { opacity: 1 });
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "document.body.classList.contains('is-fully-opaque') === true"
    ),
    '天气组件恢复 100% 透明度后未进入不透明模式。'
  );
  widgetWindow.showInactive();
  await wait(900);

  const comfortable = await inspectLayout(widgetWindow);
  const widgetWindowOpacity = widgetWindow.getOpacity();
  fs.writeFileSync(comfortableScreenshotPath, (await widgetWindow.capturePage()).toPNG());

  widgetWindow.setSize(260, 180);
  await wait(180);
  const compact = await inspectLayout(widgetWindow);
  fs.writeFileSync(compactScreenshotPath, (await widgetWindow.capturePage()).toPNG());

  const keeperWindow = new BrowserWindow({ show: false, width: 1, height: 1 });
  await widgetWindow.webContents.executeJavaScript(
    "document.querySelector('#hide-widget-btn').click()"
  );
  await waitFor(() => widgetWindow.isDestroyed(), '天气组件关闭按钮未关闭窗口。');
  const closeButtonWorks = widgetService.getWidgetById(widget.id)?.visible === 0;

  const passed = rendererErrors.length === 0
    && closeButtonWorks
    && partialWidgetWindowOpacity < 1
    && Math.abs(widgetWindowOpacity - 1) < 0.001
    && [comfortable, compact].every((result) => (
      result.noDocumentOverflow
      && result.noWidgetOverflow
      && result.elementsInsideRoot
      && result.overlappingPairs.length === 0
      && result.equalMetricHeights
      && result.equalControlHeights
      && result.title === '天气小组件'
      && result.realRoundedClip
      && result.noOuterShadow
      && result.duplicateBorderHidden
      && result.fullyOpaque
    ));
  const report = {
    finalResult: passed ? 'passed' : 'failed',
    comfortableScreenshotPath,
    compactScreenshotPath,
    comfortable,
    compact,
    closeButtonWorks,
    widgetWindowOpacity,
    partialWidgetWindowOpacity,
    rendererErrors
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
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
