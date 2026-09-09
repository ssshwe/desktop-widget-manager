const { safeIpcHandle } = require('./safeIpc');
const {
  buildUnavailableWeatherData,
  getWeatherSettings,
  refreshWeatherSettings,
  updateWeatherCity
} = require('../services/weatherService');

function registerWeatherIpc() {
  const fallbackWeather = (error, message) => ({
    id: null,
    city: '北京',
    refreshInterval: 1800,
    weatherData: buildUnavailableWeatherData('北京', '天气暂不可用'),
    updatedAt: new Date().toISOString(),
    success: false,
    message
  });

  safeIpcHandle('get-weather-settings', () => getWeatherSettings(), {
    message: '天气暂不可用。',
    fallback: fallbackWeather
  });

  safeIpcHandle('update-weather-city', (event, city) => updateWeatherCity(city), {
    message: '城市保存失败，天气暂不可用。',
    fallback: (error, message, event, city) => ({
      ...fallbackWeather(error, message),
      city: city || '北京',
      weatherData: buildUnavailableWeatherData(city || '北京', '天气暂不可用')
    })
  });

  safeIpcHandle('refresh-weather', (event, city, options) => refreshWeatherSettings(city, options), {
    message: '天气刷新失败，已尽量显示缓存数据。',
    fallback: (error, message, event, city) => ({
      ...fallbackWeather(error, message),
      city: city || '北京',
      weatherData: buildUnavailableWeatherData(city || '北京', '天气暂不可用')
    })
  });
}

module.exports = {
  registerWeatherIpc
};
