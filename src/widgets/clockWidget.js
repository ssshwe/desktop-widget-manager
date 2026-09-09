(function registerClockWidget() {
  const DEFAULT_WEATHER_REFRESH_INTERVAL_MS = 30 * 60 * 1000;
  let clockTimer = null;
  let weatherRefreshTimer = null;

  function formatTime(date) {
    return date.toLocaleTimeString('zh-CN', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  function formatDate(date) {
    return date.toLocaleDateString('zh-CN', {
      month: 'long',
      day: 'numeric'
    });
  }

  function formatWeekday(date) {
    return date.toLocaleDateString('zh-CN', {
      weekday: 'long'
    });
  }

  function formatTemperature(value) {
    const number = Number(value);

    return Number.isFinite(number) ? `${Math.round(number)}°C` : '--°C';
  }

  function updateClockElements() {
    const now = new Date();
    const timeElement = document.querySelector('#clock-time');
    const dateElement = document.querySelector('#clock-date');
    const weekdayElement = document.querySelector('#clock-weekday');

    if (!timeElement || !dateElement || !weekdayElement) {
      return;
    }

    timeElement.textContent = formatTime(now);
    timeElement.dateTime = now.toISOString();
    dateElement.textContent = formatDate(now);
    weekdayElement.textContent = formatWeekday(now);
  }

  function scheduleClockRefresh() {
    updateClockElements();

    if (clockTimer) {
      window.clearInterval(clockTimer);
    }

    clockTimer = window.setInterval(updateClockElements, 1000);
  }

  function renderWeather(setting) {
    const weatherData = setting?.weatherData || {};
    const condition = weatherData.condition || '晴';
    const conditionElement = document.querySelector('#clock-weather-condition');
    const temperatureElement = document.querySelector('#clock-weather-temp');

    if (conditionElement) {
      conditionElement.textContent = condition;
    }

    if (temperatureElement) {
      temperatureElement.textContent = formatTemperature(weatherData.currentTemperature);
    }
  }

  function getRefreshIntervalMs(setting) {
    const intervalSeconds = Number(setting?.refreshInterval);

    if (!Number.isFinite(intervalSeconds) || intervalSeconds <= 0) {
      return DEFAULT_WEATHER_REFRESH_INTERVAL_MS;
    }

    return Math.max(intervalSeconds * 1000, DEFAULT_WEATHER_REFRESH_INTERVAL_MS);
  }

  function scheduleWeatherRefresh(setting) {
    if (weatherRefreshTimer) {
      window.clearInterval(weatherRefreshTimer);
    }

    weatherRefreshTimer = window.setInterval(async () => {
      if (!window.api?.refreshWeather) {
        return;
      }

      try {
        renderWeather(await window.api.refreshWeather(undefined, { force: false }));
      } catch (error) {
        // Keep the last valid weather value visible when a refresh is unavailable.
      }
    }, getRefreshIntervalMs(setting));
  }

  async function loadWeather() {
    if (!window.api?.getWeatherSettings) {
      return;
    }

    try {
      let setting = await window.api.getWeatherSettings();

      renderWeather(setting);

      // A newly created weather setting has no cache yet. Populate it once so the
      // clock does not stay on a placeholder temperature until the next 30-minute cycle.
      if (!Number.isFinite(Number(setting?.weatherData?.currentTemperature)) && window.api?.refreshWeather) {
        setting = await window.api.refreshWeather(undefined, { force: false });
        renderWeather(setting);
      }

      scheduleWeatherRefresh(setting);
    } catch (error) {
      // The time and date remain useful even when weather data is temporarily unavailable.
    }
  }

  window.ClockWidget = {
    label: '时钟',
    render() {
      return `
        <section class="clock-widget video-scene" aria-label="时钟小组件">
          <div class="clock-primary">
            <time class="clock-time" id="clock-time" aria-label="当前时间">00:00</time>
          </div>
          <div class="clock-main-divider" aria-hidden="true"></div>
          <div class="clock-details">
            <div class="clock-weather" aria-label="当前天气">
              <img class="clock-weather-icon" src="./assets/ui-icons/weather-sun.svg" alt="" aria-hidden="true" />
              <div class="clock-weather-copy">
                <strong id="clock-weather-condition">晴</strong>
                <span id="clock-weather-temp">--°C</span>
              </div>
            </div>
            <div class="clock-detail-divider" aria-hidden="true"></div>
            <div class="clock-calendar" aria-label="当前日期">
              <time id="clock-date">读取中</time>
              <span id="clock-weekday">星期</span>
            </div>
          </div>
        </section>
      `;
    },
    mount() {
      scheduleClockRefresh();
      loadWeather();
    },
    unmount() {
      if (clockTimer) {
        window.clearInterval(clockTimer);
        clockTimer = null;
      }
      if (weatherRefreshTimer) {
        window.clearInterval(weatherRefreshTimer);
        weatherRefreshTimer = null;
      }
    }
  };
}());
