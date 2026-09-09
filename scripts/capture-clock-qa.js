process.env.DWM_DISABLE_DESKTOP_ATTACHMENT = '1';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output', 'qa', 'clock-reference');
const userDataPath = path.join(outputRoot, 'user-data');
const screenshotPath = path.join(outputRoot, 'implementation-560x370.png');
const compactScreenshotPath = path.join(outputRoot, 'implementation-300x200.png');
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
      // The renderer can briefly reload while its window configuration is applied.
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

  return { createWidgetWindow };
}

async function inspectLayout(widgetWindow) {
  return widgetWindow.webContents.executeJavaScript(`(() => {
    const root = document.querySelector('.clock-widget');
    const card = document.querySelector('.widget-card');
    const time = document.querySelector('#clock-time');
    const mainDivider = document.querySelector('.clock-main-divider');
    const details = document.querySelector('.clock-details');
    const weather = document.querySelector('.clock-weather');
    const calendar = document.querySelector('.clock-calendar');
    const dragBar = document.querySelector('.widget-drag-bar');
    const rootRect = root.getBoundingClientRect();
    const detailRect = details.getBoundingClientRect();
    const weatherRect = weather.getBoundingClientRect();
    const calendarRect = calendar.getBoundingClientRect();
    const cardStyle = getComputedStyle(card);

    return {
      viewport: { width: innerWidth, height: innerHeight },
      noDocumentOverflow: document.documentElement.scrollWidth <= innerWidth
        && document.documentElement.scrollHeight <= innerHeight,
      noWidgetOverflow: root.scrollWidth <= root.clientWidth && root.scrollHeight <= root.clientHeight,
      headerHidden: getComputedStyle(dragBar).display === 'none',
      hasGlassSurface: cardStyle.backdropFilter !== 'none' && cardStyle.borderRadius !== '0px',
      contentInsideRoot: [time, mainDivider, details, weather, calendar].every((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left >= rootRect.left - 0.5
          && rect.right <= rootRect.right + 0.5
          && rect.top >= rootRect.top - 0.5
          && rect.bottom <= rootRect.bottom + 0.5;
      }),
      layoutOrder: time.getBoundingClientRect().bottom < mainDivider.getBoundingClientRect().top
        && mainDivider.getBoundingClientRect().bottom < detailRect.top + 1,
      twoColumnDetails: weatherRect.right < calendarRect.left,
      currentTime: time.textContent,
      weatherCondition: document.querySelector('#clock-weather-condition').textContent,
      weatherTemperature: document.querySelector('#clock-weather-temp').textContent,
      date: document.querySelector('#clock-date').textContent,
      weekday: document.querySelector('#clock-weekday').textContent
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
  const rendererErrors = [];

  await database.initializeDatabase();
  configService.updateConfig({
    ...configService.getConfig(),
    theme: 'glass',
    globalOpacity: 1,
    borderRadius: 38,
    fontSize: 16,
    shadow: true
  });
  await weatherService.updateWeatherCity('北京');

  const widget = widgetService.createWidget({
    type: 'clock',
    name: '时钟小组件'
  });

  configService.updateWidgetConfig(String(widget.id), {
    width: 560,
    height: 370,
    pinned: false,
    locked: false,
    opacity: 1
  });

  const widgetWindow = widgetWindowService.createWidgetWindow(widget);
  widgetWindow.webContents.on('console-message', (event, detailsOrLevel, message) => {
    const details = typeof detailsOrLevel === 'object' ? detailsOrLevel : { level: detailsOrLevel, message };

    if (Number(details.level) >= 2) {
      rendererErrors.push(details.message || 'unknown renderer error');
    }
  });

  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "Boolean(document.querySelector('#clock-time')?.textContent.match(/^\\d{2}:\\d{2}$/))"
    ),
    'Clock time did not render.'
  );
  await waitFor(
    () => widgetWindow.webContents.executeJavaScript(
      "document.querySelector('#clock-weather-temp')?.textContent !== '--°C'"
    ),
    'Clock weather did not load.'
  );

  const liveData = await inspectLayout(widgetWindow);

  await widgetWindow.webContents.executeJavaScript(`(() => {
    document.querySelector('#clock-time').textContent = '10:08';
    document.querySelector('#clock-weather-condition').textContent = '晴';
    document.querySelector('#clock-weather-temp').textContent = '26°C';
    document.querySelector('#clock-date').textContent = '7月18日';
    document.querySelector('#clock-weekday').textContent = '星期五';
  })()`);
  await wait(180);
  fs.writeFileSync(screenshotPath, (await widgetWindow.capturePage()).toPNG());
  const referenceState = await inspectLayout(widgetWindow);

  widgetWindow.setSize(300, 200);
  await wait(180);
  fs.writeFileSync(compactScreenshotPath, (await widgetWindow.capturePage()).toPNG());
  const compactState = await inspectLayout(widgetWindow);

  const hasRequiredData = /^\d{2}:\d{2}$/.test(liveData.currentTime)
    && liveData.weatherCondition.length > 0
    && /°C$/.test(liveData.weatherTemperature)
    && /月\d+日$/.test(liveData.date)
    && liveData.weekday.startsWith('星期');
  const layoutPasses = [referenceState, compactState].every((result) => (
    result.noDocumentOverflow
    && result.noWidgetOverflow
    && result.headerHidden
    && result.hasGlassSurface
    && result.contentInsideRoot
    && result.layoutOrder
    && result.twoColumnDetails
  ));
  const passed = rendererErrors.length === 0 && hasRequiredData && layoutPasses;
  const report = {
    finalResult: passed ? 'passed' : 'failed',
    screenshotPath,
    compactScreenshotPath,
    liveData,
    referenceState,
    compactState,
    rendererErrors
  };

  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));

  widgetWindow.destroy();
  database.closeDatabase();
  app.exit(passed ? 0 : 1);
}

main().catch((error) => {
  console.error(error);
  app.exit(1);
});
