const { getDatabase, persistDatabase } = require('../db/database');
const { net } = require('electron');

const DEFAULT_CITY = '北京';
const DEFAULT_REFRESH_INTERVAL = 1800;
const REQUEST_TIMEOUT_MS = 12000;
const NOMINATIM_MIN_REQUEST_INTERVAL_MS = 1100;
let lastReverseGeocodeRequestAt = 0;

function normalizeCity(city) {
  const nextCity = typeof city === 'string' ? city.trim() : '';

  return nextCity || DEFAULT_CITY;
}

function getRequestedCity(city) {
  return typeof city === 'string' ? city.trim() : '';
}

function isResolvedLocationName(locationName) {
  const value = getRequestedCity(locationName);

  return Boolean(value) && !value.startsWith('定位区域');
}

function getCoordinateLocationLabel(coordinates) {
  const location = normalizeCoordinates(coordinates);

  if (!location) {
    return '定位区域';
  }

  return `定位区域（${location.latitude.toFixed(4)}°, ${location.longitude.toFixed(4)}°）`;
}

function normalizeCoordinates(value) {
  const latitude = Number(value?.latitude);
  const longitude = Number(value?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
    || latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
    return null;
  }

  return {
    latitude: Math.round(latitude * 1000000) / 1000000,
    longitude: Math.round(longitude * 1000000) / 1000000,
    accuracy: Number.isFinite(Number(value?.accuracy)) ? Math.max(0, Number(value.accuracy)) : null
  };
}

function sameCoordinates(left, right) {
  const first = normalizeCoordinates(left);
  const second = normalizeCoordinates(right);

  if (!first || !second) {
    return false;
  }

  return Math.abs(first.latitude - second.latitude) < 0.002
    && Math.abs(first.longitude - second.longitude) < 0.002;
}

function buildUnavailableWeatherData(city, message = '天气暂不可用') {
  return {
    city: normalizeCity(city),
    condition: '天气暂不可用',
    currentTemperature: null,
    highTemperature: null,
    lowTemperature: null,
    airQuality: '--',
    source: 'unavailable',
    errorMessage: message,
    updatedAt: new Date().toISOString()
  };
}

function isLiveWeatherData(weatherData) {
  return weatherData?.source === 'live';
}

function isWeatherCacheFresh(setting, now = new Date()) {
  const weatherData = setting?.weatherData;
  const updatedAt = weatherData?.updatedAt || setting?.updatedAt;
  const refreshIntervalMs = (Number(setting?.refreshInterval) || DEFAULT_REFRESH_INTERVAL) * 1000;
  const updatedTime = updatedAt ? new Date(updatedAt).getTime() : 0;

  const isUnresolvedDeviceLocation = weatherData?.location?.type === 'device'
    && !isResolvedLocationName(weatherData?.location?.name || weatherData?.city);

  // 旧版本写入的“定位区域（经纬度）”不是可展示的地区名，不能继续命中缓存。
  if (!isLiveWeatherData(weatherData) || isUnresolvedDeviceLocation || !updatedTime || Number.isNaN(updatedTime)) {
    return false;
  }

  return now.getTime() - updatedTime < Math.max(refreshIntervalMs, DEFAULT_REFRESH_INTERVAL * 1000);
}

function weatherCodeToCondition(code, isDay) {
  const weatherCode = Number(code);

  if (weatherCode === 0) return isDay === 0 ? '晴夜' : '晴';
  if (weatherCode === 1) return '晴间多云';
  if (weatherCode === 2) return '多云';
  if (weatherCode === 3) return '阴';
  if ([45, 48].includes(weatherCode)) return '雾';
  if ([51, 53, 55, 56, 57].includes(weatherCode)) return '毛毛雨';
  if ([61, 63, 65, 66, 67].includes(weatherCode)) return '雨';
  if ([71, 73, 75, 77].includes(weatherCode)) return '雪';
  if ([80, 81, 82].includes(weatherCode)) return '阵雨';
  if ([85, 86].includes(weatherCode)) return '阵雪';
  if ([95, 96, 99].includes(weatherCode)) return '雷暴';

  return '天气待更新';
}

function formatAirQuality(usAqi) {
  const aqi = Number(usAqi);

  if (!Number.isFinite(aqi)) return '--';
  if (aqi <= 50) return '优';
  if (aqi <= 100) return '良';
  if (aqi <= 150) return '轻度污染';
  if (aqi <= 200) return '中度污染';
  if (aqi <= 300) return '重度污染';
  return '严重污染';
}

async function fetchJson(url, serviceName, headers = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  // Electron 的 net.fetch 使用 Chromium 的网络栈与系统代理配置；
  // Windows 上它比 Node/undici 更能适配用户当前的网络环境。
  const request = typeof net?.fetch === 'function'
    ? net.fetch.bind(net)
    : globalThis.fetch;

  try {
    const response = await request(url, {
      headers: {
        Accept: 'application/json',
        ...headers
      },
      signal: controller.signal
    });

    if (!response.ok) {
      throw new Error(`${serviceName}服务返回 ${response.status}`);
    }

    return await response.json();
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`${serviceName}请求超时`);
    }

    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function geocodeCity(city) {
  const query = new URLSearchParams({
    name: normalizeCity(city),
    count: '1',
    language: 'zh',
    format: 'json'
  });
  const payload = await fetchJson(
    `https://geocoding-api.open-meteo.com/v1/search?${query.toString()}`,
    '城市定位'
  );
  const result = payload?.results?.[0];

  if (!result || !Number.isFinite(Number(result.latitude)) || !Number.isFinite(Number(result.longitude))) {
    throw new Error(`未找到城市“${normalizeCity(city)}”`);
  }

  return {
    city: result.name || normalizeCity(city),
    country: result.country || '',
    latitude: Number(result.latitude),
    longitude: Number(result.longitude)
  };
}

function getReverseGeocodedCity(payload) {
  const address = payload?.address || {};
  const candidates = [
    address.suburb,
    address.city_district,
    address.neighbourhood,
    address.city || address.town || address.village || address.municipality || address.county,
    address.state
  ]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);

  return candidates.slice(0, 2).join(' · ');
}

async function reverseGeocodeCity(coordinates) {
  const waitMs = Math.max(0, NOMINATIM_MIN_REQUEST_INTERVAL_MS - (Date.now() - lastReverseGeocodeRequestAt));

  if (waitMs) {
    await new Promise((resolve) => setTimeout(resolve, waitMs));
  }

  lastReverseGeocodeRequestAt = Date.now();
  const query = new URLSearchParams({
    format: 'jsonv2',
    lat: String(coordinates.latitude),
    lon: String(coordinates.longitude),
    zoom: '10',
    'accept-language': 'zh-CN'
  });
  const payload = await fetchJson(
    `https://nominatim.openstreetmap.org/reverse?${query.toString()}`,
    '当前位置名称',
    {
      // Nominatim 公共实例要求可识别的 User-Agent；定位仅由用户点击按钮触发。
      'User-Agent': 'desktop-widget-manager/0.1.0 (weather-widget)'
    }
  );

  return getReverseGeocodedCity(payload);
}

async function fetchWeatherForCoordinates(coordinates, options = {}) {
  const location = normalizeCoordinates(coordinates);

  if (!location) {
    throw new Error('位置信息无效，无法获取天气。');
  }

  const weatherQuery = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'temperature_2m,apparent_temperature,is_day,weather_code,wind_speed_10m',
    daily: 'weather_code,temperature_2m_max,temperature_2m_min',
    timezone: 'auto',
    forecast_days: '1'
  });
  const airQualityQuery = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: 'us_aqi,pm2_5',
    timezone: 'auto'
  });
  const [weather, airQualityResult] = await Promise.all([
    fetchJson(`https://api.open-meteo.com/v1/forecast?${weatherQuery.toString()}`, '天气'),
    // 空气质量接口短暂不可用时，天气仍应正常显示。
    fetchJson(
      `https://air-quality-api.open-meteo.com/v1/air-quality?${airQualityQuery.toString()}`,
      '空气质量'
    ).catch(() => null)
  ]);
  const current = weather?.current;
  const daily = weather?.daily;

  if (!current || !daily) {
    throw new Error('天气服务返回的数据不完整。');
  }

  const city = options.city || '当前位置';
  const temperature = Number(current.temperature_2m);
  const highTemperature = Number(daily.temperature_2m_max?.[0]);
  const lowTemperature = Number(daily.temperature_2m_min?.[0]);

  return {
    city,
    condition: weatherCodeToCondition(current.weather_code, current.is_day),
    currentTemperature: Number.isFinite(temperature) ? temperature : null,
    highTemperature: Number.isFinite(highTemperature) ? highTemperature : null,
    lowTemperature: Number.isFinite(lowTemperature) ? lowTemperature : null,
    airQuality: formatAirQuality(airQualityResult?.current?.us_aqi),
    airQualityValue: Number.isFinite(Number(airQualityResult?.current?.us_aqi))
      ? Number(airQualityResult.current.us_aqi)
      : null,
    pm25: Number.isFinite(Number(airQualityResult?.current?.pm2_5))
      ? Number(airQualityResult.current.pm2_5)
      : null,
    apparentTemperature: Number.isFinite(Number(current.apparent_temperature))
      ? Number(current.apparent_temperature)
      : null,
    windSpeed: Number.isFinite(Number(current.wind_speed_10m)) ? Number(current.wind_speed_10m) : null,
    source: 'live',
    provider: 'open-meteo',
    location: {
      latitude: location.latitude,
      longitude: location.longitude,
      accuracy: location.accuracy,
      type: options.locationType || 'city'
    },
    weatherObservedAt: current.time || null,
    updatedAt: new Date().toISOString()
  };
}

async function fetchRealWeatherData(city) {
  const place = await geocodeCity(city);

  return fetchWeatherForCoordinates(place, {
    city: place.city,
    locationType: 'city'
  });
}

async function fetchWeatherForCurrentLocation(coordinates, locationName = '') {
  const location = normalizeCoordinates(coordinates);

  if (!location) {
    throw new Error('当前位置坐标无效。');
  }

  const providedLocationName = isResolvedLocationName(locationName)
    ? getRequestedCity(locationName)
    : '';
  // 正常流程中由渲染进程使用“用户刚同意的位置”反查区/县和城市。
  // 旧缓存或兼容调用没有名称时，再使用主进程反查作为后备。
  const cityPromise = providedLocationName
    ? Promise.resolve(providedLocationName)
    : reverseGeocodeCity(location).catch(() => '');
  const weatherData = await fetchWeatherForCoordinates(location, {
    city: providedLocationName || getCoordinateLocationLabel(location),
    locationType: 'device'
  });
  const city = await Promise.race([
    cityPromise,
    new Promise((resolve) => setTimeout(() => resolve(''), 2500))
  ]);

  return {
    ...weatherData,
    city: city || getCoordinateLocationLabel(location),
    location: {
      ...weatherData.location,
      name: city || getCoordinateLocationLabel(location)
    }
  };
}

function mapWeatherRow(row) {
  let weatherData = null;

  try {
    weatherData = row.weather_data ? JSON.parse(row.weather_data) : null;
  } catch (error) {
    weatherData = null;
  }

  return {
    id: row.id,
    city: row.city || DEFAULT_CITY,
    refreshInterval: Number(row.refresh_interval) || DEFAULT_REFRESH_INTERVAL,
    weatherData,
    updatedAt: row.updated_at
  };
}

function readFirstWeatherSetting() {
  try {
    const db = getDatabase();
    const statement = db.prepare(`
      SELECT id, city, refresh_interval, weather_data, updated_at
      FROM weather_settings
      ORDER BY id ASC
      LIMIT 1
    `);
    let setting = null;

    if (statement.step()) {
      setting = mapWeatherRow(statement.getAsObject());
    }

    statement.free();

    return setting;
  } catch (error) {
    console.error('[weather] 读取天气缓存失败：', error);
    return null;
  }
}

function createDefaultWeatherSetting() {
  try {
    const db = getDatabase();

    // 默认只保存城市，不写入任何模拟天气；首次渲染后由真实接口填充缓存。
    db.run(
      `
        INSERT INTO weather_settings (city, refresh_interval, weather_data, updated_at)
        VALUES (?, ?, NULL, CURRENT_TIMESTAMP)
      `,
      [DEFAULT_CITY, DEFAULT_REFRESH_INTERVAL]
    );
    persistDatabase();

    return readFirstWeatherSetting();
  } catch (error) {
    console.error('[weather] 创建默认天气配置失败：', error);
    return {
      id: null,
      city: DEFAULT_CITY,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,
      weatherData: buildUnavailableWeatherData(DEFAULT_CITY, '天气暂不可用'),
      updatedAt: new Date().toISOString(),
      success: false,
      message: '天气暂不可用'
    };
  }
}

function ensureWeatherSetting() {
  return readFirstWeatherSetting() || createDefaultWeatherSetting();
}

function saveWeatherSetting(settingId, city, weatherData, refreshInterval = DEFAULT_REFRESH_INTERVAL) {
  try {
    const db = getDatabase();

    if (settingId) {
      db.run(
        `
          UPDATE weather_settings
          SET city = ?, refresh_interval = ?, weather_data = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [
          normalizeCity(city),
          Number(refreshInterval) || DEFAULT_REFRESH_INTERVAL,
          JSON.stringify(weatherData),
          settingId
        ]
      );
    } else {
      db.run(
        `
          INSERT INTO weather_settings (city, refresh_interval, weather_data, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          normalizeCity(city),
          Number(refreshInterval) || DEFAULT_REFRESH_INTERVAL,
          JSON.stringify(weatherData)
        ]
      );
    }
    persistDatabase();

    return readFirstWeatherSetting() || {
      id: settingId || null,
      city: normalizeCity(city),
      refreshInterval: Number(refreshInterval) || DEFAULT_REFRESH_INTERVAL,
      weatherData,
      updatedAt: weatherData?.updatedAt || new Date().toISOString()
    };
  } catch (error) {
    console.error('[weather] 保存天气配置失败：', error);
    return {
      id: settingId || null,
      city: normalizeCity(city),
      refreshInterval: Number(refreshInterval) || DEFAULT_REFRESH_INTERVAL,
      weatherData,
      updatedAt: weatherData?.updatedAt || new Date().toISOString(),
      success: false,
      message: '天气数据已获取，但本地缓存保存失败。'
    };
  }
}

function getWeatherSettings() {
  try {
    return ensureWeatherSetting();
  } catch (error) {
    console.error('[weather] 获取天气设置失败：', error);
    return {
      id: null,
      city: DEFAULT_CITY,
      refreshInterval: DEFAULT_REFRESH_INTERVAL,
      weatherData: buildUnavailableWeatherData(DEFAULT_CITY, '天气暂不可用'),
      updatedAt: new Date().toISOString(),
      success: false,
      message: '天气暂不可用'
    };
  }
}

function getCachedFallback(setting, city, coordinates, message) {
  const cachedData = setting?.weatherData;
  const isMatchingCity = !coordinates && normalizeCity(setting?.city) === normalizeCity(city);
  const isMatchingLocation = coordinates && sameCoordinates(cachedData?.location, coordinates);

  if (isLiveWeatherData(cachedData) && (isMatchingCity || isMatchingLocation)) {
    return {
      ...setting,
      weatherData: {
        ...cachedData,
        source: 'cache',
        errorMessage: message
      },
      success: false,
      message: `${message}，已显示上次获取的数据。`
    };
  }

  return {
    id: setting?.id || null,
    city: normalizeCity(city),
    refreshInterval: setting?.refreshInterval || DEFAULT_REFRESH_INTERVAL,
    weatherData: buildUnavailableWeatherData(city, message),
    updatedAt: new Date().toISOString(),
    success: false,
    message
  };
}

async function updateWeatherCity(city) {
  const requestedCity = getRequestedCity(city);

  if (!requestedCity) {
    return getCachedFallback(ensureWeatherSetting(), DEFAULT_CITY, null, '请输入城市名称。');
  }

  return refreshWeatherSettings(requestedCity, { force: true });
}

async function refreshWeatherSettings(city, options = {}) {
  const setting = ensureWeatherSetting();
  const coordinates = normalizeCoordinates(options?.coordinates);
  const requestedLocationName = getRequestedCity(options?.locationName);
  const cachedLocationName = getRequestedCity(setting?.weatherData?.location?.name);
  const locationName = isResolvedLocationName(requestedLocationName)
    ? requestedLocationName
    : (isResolvedLocationName(cachedLocationName) ? cachedLocationName : '');
  const requestedCity = getRequestedCity(city);
  const nextCity = requestedCity || setting?.city || DEFAULT_CITY;
  const force = options?.force === true;
  const locationMatchesCache = coordinates
    ? sameCoordinates(setting?.weatherData?.location, coordinates)
    : normalizeCity(setting?.city) === normalizeCity(nextCity);

  if (!force && setting?.weatherData && locationMatchesCache && isWeatherCacheFresh(setting)) {
    return {
      ...setting,
      message: '天气数据仍在缓存有效期内。'
    };
  }

  try {
    const weatherData = coordinates
      ? await fetchWeatherForCurrentLocation(coordinates, locationName)
      : await fetchRealWeatherData(nextCity);

    return saveWeatherSetting(setting.id, weatherData.city || nextCity, weatherData, setting.refreshInterval);
  } catch (error) {
    console.error('[weather] 天气刷新失败：', error);
    const message = error?.message
      ? `实时天气刷新失败：${error.message}`
      : '实时天气刷新失败';

    return getCachedFallback(setting, nextCity, coordinates, message);
  }
}

module.exports = {
  buildUnavailableWeatherData,
  fetchRealWeatherData,
  fetchWeatherForCurrentLocation,
  getWeatherSettings,
  refreshWeatherSettings,
  updateWeatherCity,
  weatherCodeToCondition
};
