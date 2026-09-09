(function registerWeatherWidget() {
  const DEFAULT_WEATHER_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
  let weatherRefreshTimer = null;
  let currentWeatherData = null;
  let temperatureAnimation = null;

  const DwmUi = window.DwmUi;
  const escapeHtml = DwmUi.escapeHtml;

  function getWeatherSymbol(condition) {
    const text = String(condition || '');

    if (!text) {
      return '--';
    }

    if (text.includes('雷')) {
      return '雷';
    }

    if (text.includes('雪')) {
      return '雪';
    }

    if (text.includes('雨')) {
      return '雨';
    }

    if (text.includes('雾')) {
      return '雾';
    }

    if (text.includes('云')) {
      return '云';
    }

    if (text.includes('阴')) {
      return '阴';
    }

    return '晴';
  }

  function formatTemperature(value) {
    const number = Number(value);

    return Number.isFinite(number) ? `${Math.round(number)}°C` : '--°C';
  }

  function updateCurrentTemperatureText(element, value) {
    const numberText = Number.isFinite(Number(value)) ? String(Math.round(Number(value))) : '--';
    const unit = document.createElement('span');

    unit.className = 'weather-temp-unit';
    unit.textContent = '°C';
    element.replaceChildren(document.createTextNode(numberText), unit);
  }

  function renderCurrentTemperature(value) {
    const element = document.querySelector('#weather-current-temp');
    const nextTemperature = Number(value);
    const previousTemperature = Number(element.dataset.temperature);

    temperatureAnimation?.cancel?.();
    temperatureAnimation = null;

    if (!Number.isFinite(nextTemperature)) {
      delete element.dataset.temperature;
      updateCurrentTemperatureText(element, null);
      return;
    }

    element.dataset.temperature = String(nextTemperature);
    if (!Number.isFinite(previousTemperature) || previousTemperature === nextTemperature) {
      updateCurrentTemperatureText(element, nextTemperature);
      return;
    }

    temperatureAnimation = DwmUi.runMotion(
      previousTemperature,
      nextTemperature,
      {
        duration: 0.36,
        ease: 'easeOut',
        onUpdate: (latest) => updateCurrentTemperatureText(element, latest)
      }
    );

    if (!temperatureAnimation) {
      updateCurrentTemperatureText(element, nextTemperature);
    }
  }

  function formatUpdatedAt(value) {
    if (!value) {
      return '尚未刷新';
    }

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function renderWeather(setting) {
    const weatherData = setting?.weatherData || {};
    const city = weatherData.city || setting?.city || '北京';
    const condition = weatherData.condition || '正在获取天气';
    const sourceLabels = {
      live: '实时数据',
      cache: '缓存数据',
      unavailable: '暂不可用'
    };
    const sourceLabel = sourceLabels[weatherData.source] || '正在更新';

    currentWeatherData = weatherData;

    document.querySelector('#weather-city').value = city;
    document.querySelector('#weather-city-name').textContent = city;
    document.querySelector('#weather-symbol').textContent = getWeatherSymbol(condition);
    document.querySelector('#weather-condition').textContent = condition;
    renderCurrentTemperature(weatherData.currentTemperature);
    document.querySelector('#weather-high-temp').textContent = formatTemperature(weatherData.highTemperature);
    document.querySelector('#weather-low-temp').textContent = formatTemperature(weatherData.lowTemperature);
    document.querySelector('#weather-air-quality').textContent = weatherData.airQuality || '--';
    document.querySelector('#weather-source').textContent = sourceLabel;
    document.querySelector('#weather-updated-at').textContent = `更新：${formatUpdatedAt(weatherData.updatedAt || setting?.updatedAt)}`;

    if (setting?.message || weatherData.errorMessage) {
      setWeatherMessage(setting.message || weatherData.errorMessage);
    }
  }

  function setWeatherMessage(message) {
    document.querySelector('#weather-message').textContent = message;
  }

  async function loadWeather() {
    let setting = await window.api.getWeatherSettings();
    const savedLocation = setting?.weatherData?.location;
    const usesDeviceLocation = savedLocation?.type === 'device';

    renderWeather(setting);
    setting = await window.api.refreshWeather(
      usesDeviceLocation ? '' : document.querySelector('#weather-city')?.value.trim(),
      usesDeviceLocation
        ? {
          force: false,
          coordinates: savedLocation,
          locationName: savedLocation.name
        }
        : { force: false }
    );
    renderWeather(setting);
    scheduleWeatherAutoRefresh(setting);
    return setting;
  }

  function getRefreshIntervalMs(setting) {
    const intervalSeconds = Number(setting?.refreshInterval);

    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      return DEFAULT_WEATHER_REFRESH_INTERVAL_MS;
    }

    return Math.max(intervalSeconds * 1000, DEFAULT_WEATHER_REFRESH_INTERVAL_MS);
  }

  function scheduleWeatherAutoRefresh(setting) {
    if (weatherRefreshTimer) {
      clearInterval(weatherRefreshTimer);
    }

    // 天气自动刷新最低 30 分钟一次，避免多个天气小组件频繁请求接口。
    weatherRefreshTimer = window.setInterval(async () => {
      const savedLocation = currentWeatherData?.location;
      const usesDeviceLocation = savedLocation?.type === 'device';

      try {
        const nextSetting = await window.api.refreshWeather(
          usesDeviceLocation ? '' : document.querySelector('#weather-city')?.value.trim(),
          usesDeviceLocation
            ? {
              force: false,
              coordinates: savedLocation,
              locationName: savedLocation.name
            }
            : { force: false }
        );

        renderWeather(nextSetting);
      } catch (error) {
        setWeatherMessage('天气自动刷新失败，已保留当前数据。');
      }
    }, getRefreshIntervalMs(setting));
  }

  async function handleCitySubmit(event) {
    event.preventDefault();

    const city = document.querySelector('#weather-city').value.trim();

    if (!city) {
      setWeatherMessage('请先输入城市名称。');
      return;
    }

    // 城市配置与实时天气缓存均由主进程统一保存，渲染层不直接请求外部服务。
    const setting = await window.api.updateWeatherCity(city);

    renderWeather(setting);
    setWeatherMessage(setting.message || '城市已保存。');
  }

  async function handleRefreshClick() {
    const savedLocation = currentWeatherData?.location;
    const usesDeviceLocation = savedLocation?.type === 'device';
    const heroElement = document.querySelector('.weather-hero');
    const skyObject = heroElement?.querySelector('.weather-sky-object');

    if (heroElement) {
      heroElement.classList.remove('is-refreshing');
      skyObject?.classList.remove('video-feedback-refresh');
      void heroElement.offsetWidth;
      heroElement.classList.add('is-refreshing');
      skyObject?.classList.add('video-feedback-refresh');
      window.setTimeout(() => {
        heroElement.classList.remove('is-refreshing');
        skyObject?.classList.remove('video-feedback-refresh');
      }, 620);
    }

    const setting = await window.api.refreshWeather(
      usesDeviceLocation ? '' : document.querySelector('#weather-city').value.trim(),
      usesDeviceLocation
        ? {
          force: true,
          coordinates: savedLocation,
          locationName: savedLocation.name
        }
        : { force: true }
    );

    renderWeather(setting);
    scheduleWeatherAutoRefresh(setting);
    setWeatherMessage(setting.message || '天气已刷新。');
  }

  function getPosition() {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('当前系统不支持定位服务。'));
        return;
      }

      navigator.geolocation.getCurrentPosition(resolve, reject, {
        enableHighAccuracy: false,
        maximumAge: 5 * 60 * 1000,
        timeout: 12000
      });
    });
  }

  function getLocationErrorMessage(error) {
    if (error?.code === 1) return '定位权限未授予，请在系统设置中允许此应用访问位置。';
    if (error?.code === 2) return '当前位置暂不可用，请检查系统定位服务。';
    if (error?.code === 3) return '定位超时，请稍后重试。';
    return error?.message || '定位失败，请稍后重试。';
  }

  function getCoordinateLocationLabel(coordinates) {
    const latitude = Number(coordinates?.latitude);
    const longitude = Number(coordinates?.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return '定位区域';
    }

    const latitudeDirection = latitude >= 0 ? 'N' : 'S';
    const longitudeDirection = longitude >= 0 ? 'E' : 'W';

    return `定位区域（${Math.abs(latitude).toFixed(4)}°${latitudeDirection}，${Math.abs(longitude).toFixed(4)}°${longitudeDirection}）`;
  }

  function getLocationNameFromResponse(data) {
    const candidates = [
      data?.locality,
      data?.city,
      data?.principalSubdivision
    ]
      .map((value) => String(value || '').trim())
      .filter(Boolean)
      .filter((value, index, values) => values.indexOf(value) === index);

    return candidates.slice(0, 2).join(' · ');
  }

  async function reverseGeocodeCurrentLocation(coordinates) {
    const query = new URLSearchParams({
      latitude: String(coordinates.latitude),
      longitude: String(coordinates.longitude),
      localityLanguage: 'zh'
    });
    const response = await fetch(
      `https://api.bigdatacloud.net/data/reverse-geocode-client?${query.toString()}`,
      {
        headers: {
          Accept: 'application/json'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`地区解析服务返回 ${response.status}`);
    }

    const name = getLocationNameFromResponse(await response.json());

    if (!name) {
      throw new Error('地区解析服务未返回地区名称。');
    }

    return name;
  }

  async function handleLocationClick() {
    const button = document.querySelector('#weather-location-btn');

    try {
      button.disabled = true;
      setWeatherMessage('正在获取当前位置…');
      const position = await getPosition();
      const coordinates = {
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy
      };
      let locationName = '';

      try {
        // 主服务直接在用户设备中解析，符合其客户端 API 的使用方式。
        locationName = await reverseGeocodeCurrentLocation(coordinates);
      } catch (error) {
        // 不把“定位区域…”当作地区名传给主进程，以便启用后备反查服务。
        console.warn('[weather] 客户端地区反查失败，正在使用备用服务：', error);
      }

      const setting = await window.api.refreshWeather('', {
        force: true,
        coordinates,
        ...(locationName ? { locationName } : {})
      });
      const displayLocationName = setting?.weatherData?.city || locationName || getCoordinateLocationLabel(coordinates);

      renderWeather(setting);
      scheduleWeatherAutoRefresh(setting);
      setWeatherMessage(setting.message || `已更新${displayLocationName}的天气。`);
    } catch (error) {
      setWeatherMessage(getLocationErrorMessage(error));
    } finally {
      button.disabled = false;
    }
  }

  function buildWeatherAnnouncement(weatherData) {
    const city = weatherData?.city || '当前位置';
    const condition = weatherData?.condition || '天气暂不可用';
    const parts = [`${city}，${condition}`];

    if (Number.isFinite(Number(weatherData?.currentTemperature))) {
      parts.push(`当前气温${Math.round(Number(weatherData.currentTemperature))}度`);
    }

    if (Number.isFinite(Number(weatherData?.highTemperature)) && Number.isFinite(Number(weatherData?.lowTemperature))) {
      parts.push(`今天最高${Math.round(Number(weatherData.highTemperature))}度，最低${Math.round(Number(weatherData.lowTemperature))}度`);
    }

    if (weatherData?.airQuality && weatherData.airQuality !== '--') {
      parts.push(`空气质量${weatherData.airQuality}`);
    }

    return `${parts.join('，')}。`;
  }

  function handleSpeakClick() {
    if (!currentWeatherData || currentWeatherData.source === 'unavailable') {
      setWeatherMessage('暂无可播报的实时天气。');
      return;
    }

    if (!('speechSynthesis' in window) || !('SpeechSynthesisUtterance' in window)) {
      setWeatherMessage('当前环境不支持天气语音播报。');
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(buildWeatherAnnouncement(currentWeatherData));

    utterance.lang = 'zh-CN';
    utterance.rate = 1;
    utterance.onstart = () => setWeatherMessage('正在播报天气…');
    utterance.onerror = () => setWeatherMessage('天气播报失败，请检查系统语音服务。');
    window.speechSynthesis.speak(utterance);
  }

  window.WeatherWidget = {
    label: '天气小组件',
    render(params) {
      return `
        <section class="weather-widget video-scene" aria-label="天气小组件">
          <span class="widget-kicker weather-widget-name">${escapeHtml(params.name)}</span>
          <div class="weather-hero video-hero">
            <div class="weather-temp-panel">
              <div class="weather-city-line">
                <strong id="weather-city-name">天气</strong>
                <img src="./assets/ui-icons/weather-map-pin-filled.svg" alt="" aria-hidden="true" />
              </div>
              <strong id="weather-current-temp" class="weather-current-temp">--°C</strong>
              <div class="weather-condition-line">
                <img src="./assets/ui-icons/weather-sun.svg" alt="" aria-hidden="true" />
                <span id="weather-condition" class="weather-condition">加载中</span>
                <span id="weather-symbol" class="weather-symbol">晴</span>
                <button id="weather-speak-btn" type="button" aria-label="播报当前天气">播报</button>
              </div>
              <div class="weather-data-meta">
                <span id="weather-source" class="weather-source">正在更新</span>
                <span id="weather-updated-at" class="weather-updated-at">更新：尚未刷新</span>
              </div>
            </div>
            <div class="weather-sky-object video-hero-object">
              <img class="weather-object-image" src="./assets/widget-visuals/weather-object-reference-v2.png" alt="太阳与云朵天气插画" />
            </div>
          </div>

          <div class="weather-metrics">
            <article class="weather-metric-card video-floating-card video-enter-stagger">
              <div class="weather-metric-copy">
                <span>最高</span>
                <strong id="weather-high-temp">--°C</strong>
              </div>
              <span class="weather-metric-icon weather-metric-icon--high" aria-hidden="true">
                <img src="./assets/ui-icons/weather-thermometer-high.svg" alt="" />
              </span>
            </article>
            <article class="weather-metric-card video-floating-card video-enter-stagger">
              <div class="weather-metric-copy">
                <span>最低</span>
                <strong id="weather-low-temp">--°C</strong>
              </div>
              <span class="weather-metric-icon weather-metric-icon--low" aria-hidden="true">
                <img src="./assets/ui-icons/weather-thermometer-low.svg" alt="" />
              </span>
            </article>
            <article class="weather-metric-card video-floating-card video-enter-stagger">
              <div class="weather-metric-copy">
                <span>空气质量</span>
                <strong id="weather-air-quality">--</strong>
              </div>
              <span class="weather-metric-icon weather-metric-icon--air" aria-hidden="true">
                <img src="./assets/ui-icons/weather-leaf.svg" alt="" />
              </span>
            </article>
          </div>

          <form id="weather-city-form" class="weather-form video-action-dock">
            <label class="weather-city-control" for="weather-city">
              <img class="weather-city-control__pin" src="./assets/ui-icons/weather-map-pin-filled.svg" alt="" aria-hidden="true" />
              <input id="weather-city" type="text" maxlength="40" placeholder="输入城市" aria-label="城市" />
              <img class="weather-city-control__chevron" src="./assets/ui-icons/weather-chevron-down.svg" alt="" aria-hidden="true" />
            </label>
            <button id="weather-location-btn" type="button" title="使用当前位置">定位</button>
            <button class="weather-save-button" type="submit">保存</button>
            <button id="weather-refresh-btn" type="button">
              <img src="./assets/ui-icons/figma-icon-25.svg" alt="" aria-hidden="true" />
              <span>刷新</span>
            </button>
          </form>

          <p id="weather-message" class="weather-message" role="status" aria-live="polite"></p>
        </section>
      `;
    },
    async mount() {
      document.querySelector('#weather-city-form').addEventListener('submit', handleCitySubmit);
      document.querySelector('#weather-refresh-btn').addEventListener('click', handleRefreshClick);
      document.querySelector('#weather-location-btn').addEventListener('click', handleLocationClick);
      document.querySelector('#weather-speak-btn').addEventListener('click', handleSpeakClick);

      try {
        await loadWeather();
      } catch (error) {
        setWeatherMessage('天气加载失败，请稍后重试。');
      }
    },
    unmount() {
      if (weatherRefreshTimer) {
        clearInterval(weatherRefreshTimer);
        weatherRefreshTimer = null;
      }
      window.speechSynthesis?.cancel();
      temperatureAnimation?.cancel?.();
      temperatureAnimation = null;
    }
  };
}());
