const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { writeFileAtomic } = require('../utils/atomicFile');

const FALLBACK_DEFAULT_CONFIG = {
  theme: 'light',
  globalOpacity: 0.92,
  borderRadius: 24,
  fontSize: 16,
  shadow: true,
  autoStart: false,
  managerWindow: {
    width: 1000,
    height: 700,
    center: true
  },
  widgets: {}
};
let cachedConfig = null;
let cachedDefaultConfig = null;

function getConfigPath() {
  // 配置文件放在 Electron 用户数据目录中，避免写入项目源码目录。
  return path.join(app.getPath('userData'), 'config.json');
}

function getDefaultConfigPath() {
  return path.join(__dirname, '..', '..', 'resources', 'config.default.json');
}

function readJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJsonFile(filePath, data) {
  // 使用临时文件 + fsync + rename，避免断电或崩溃时留下半个 JSON 文件。
  writeFileAtomic(filePath, `${JSON.stringify(data, null, 2)}\n`, {
    encoding: 'utf8'
  });
}

function deepMerge(base, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    return base;
  }

  const result = { ...base };

  Object.keys(patch).forEach((key) => {
    const baseValue = result[key];
    const patchValue = patch[key];

    if (
      baseValue &&
      patchValue &&
      typeof baseValue === 'object' &&
      typeof patchValue === 'object' &&
      !Array.isArray(baseValue) &&
      !Array.isArray(patchValue)
    ) {
      result[key] = deepMerge(baseValue, patchValue);
      return;
    }

    result[key] = patchValue;
  });

  return result;
}

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config));
}

function clampNumber(value, min, max, fallback) {
  const numberValue = Number(value);

  if (!Number.isFinite(numberValue)) {
    return fallback;
  }

  return Math.min(Math.max(numberValue, min), max);
}

function normalizeWidgetConfigKeys(widgetConfigs) {
  if (!widgetConfigs || typeof widgetConfigs !== 'object' || Array.isArray(widgetConfigs)) {
    return {};
  }

  const normalized = {};

  Object.entries(widgetConfigs).forEach(([key, value]) => {
    const legacyMatch = /^widget-(\d+)$/.exec(key);
    const normalizedKey = legacyMatch ? legacyMatch[1] : key;

    // Prefer an existing numeric key when both forms were written by an older build.
    if (legacyMatch && Object.prototype.hasOwnProperty.call(widgetConfigs, normalizedKey)) {
      return;
    }

    normalized[normalizedKey] = value;
  });

  return normalized;
}

function normalizeThemeSettings(config) {
  const theme = ['light', 'dark', 'glass'].includes(config.theme) ? config.theme : 'light';

  return {
    ...config,
    // 主题配置会直接影响窗口透明度和 CSS 变量，写入前统一收敛到安全范围。
    theme,
    globalOpacity: clampNumber(config.globalOpacity, 0.45, 1, 0.92),
    borderRadius: Math.round(clampNumber(config.borderRadius, 4, 32, 24)),
    fontSize: Math.round(clampNumber(config.fontSize, 13, 20, 16)),
    shadow: config.shadow !== false,
    // 开机自启动默认关闭，读取旧配置时也统一转换为布尔值。
    autoStart: config.autoStart === true,
    widgets: normalizeWidgetConfigKeys(config.widgets)
  };
}

function getDefaultConfig() {
  if (cachedDefaultConfig) {
    return cloneConfig(cachedDefaultConfig);
  }

  try {
    cachedDefaultConfig = normalizeThemeSettings(readJsonFile(getDefaultConfigPath()));
  } catch (error) {
    console.error('[config] 默认配置文件读取失败，已使用内置默认配置：', error);
    cachedDefaultConfig = normalizeThemeSettings(FALLBACK_DEFAULT_CONFIG);
  }

  return cloneConfig(cachedDefaultConfig);
}

function createDefaultConfig() {
  const configPath = getConfigPath();
  const userDataDir = path.dirname(configPath);
  const defaultConfig = getDefaultConfig();

  try {
    fs.mkdirSync(userDataDir, { recursive: true });
    writeJsonFile(configPath, defaultConfig);
  } catch (error) {
    console.error('[config] 默认配置写入失败，将使用内存默认配置继续运行：', error);
  }

  return defaultConfig;
}

function backupBrokenConfig(configPath) {
  if (!fs.existsSync(configPath)) {
    return '';
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${configPath}.broken-${timestamp}.bak`;

  try {
    // 配置损坏时先备份原文件，再生成默认配置，避免用户数据直接丢失。
    fs.copyFileSync(configPath, backupPath);
    return backupPath;
  } catch (error) {
    console.error('[config] 备份损坏配置文件失败：', error);
    return '';
  }
}

function getConfig() {
  if (cachedConfig) {
    return cloneConfig(cachedConfig);
  }

  const configPath = getConfigPath();

  if (!fs.existsSync(configPath)) {
    cachedConfig = createDefaultConfig();
    return cloneConfig(cachedConfig);
  }

  try {
    const defaultConfig = getDefaultConfig();
    const currentConfig = readJsonFile(configPath);
    const mergedConfig = normalizeThemeSettings(deepMerge(defaultConfig, currentConfig));

    // 兼容后续新增默认字段：读取后补齐缺失字段并保存。
    writeJsonFile(configPath, mergedConfig);

    cachedConfig = mergedConfig;
    return cloneConfig(cachedConfig);
  } catch (error) {
    const backupPath = backupBrokenConfig(configPath);
    const defaultConfig = createDefaultConfig();

    console.warn(`[config] config.json 无法解析，已恢复默认配置。备份文件：${backupPath || '无'}`, error);

    cachedConfig = defaultConfig;
    return cloneConfig(cachedConfig);
  }
}

function updateConfig(newConfig) {
  // 合并写入全局配置，适合保存主题、透明度、窗口尺寸等系统偏好。
  const currentConfig = getConfig();
  const nextConfig = normalizeThemeSettings(deepMerge(currentConfig, newConfig));

  try {
    writeJsonFile(getConfigPath(), nextConfig);
    cachedConfig = nextConfig;
  } catch (error) {
    console.error('[config] config.json 写入失败：', error);
    throw new Error('配置保存失败，请检查用户数据目录权限。');
  }

  return nextConfig;
}

function resetConfig() {
  // 恢复默认配置，常用于设置页中的“重置设置”功能。
  cachedConfig = createDefaultConfig();
  return cloneConfig(cachedConfig);
}

function updateWidgetConfig(widgetKey, config) {
  if (!widgetKey || typeof widgetKey !== 'string') {
    throw new Error('widgetKey 必须是非空字符串。');
  }

  const currentConfig = getConfig();
  const currentWidgetConfig = currentConfig.widgets[widgetKey] || {};
  const nextWidgetConfig = deepMerge(currentWidgetConfig, config);
  const nextConfig = {
    ...currentConfig,
    widgets: {
      ...currentConfig.widgets,
      [widgetKey]: nextWidgetConfig
    }
  };

  // 单个小组件配置用于保存位置、大小、透明度、主题、置顶和锁定状态。
  writeJsonFile(getConfigPath(), nextConfig);
  cachedConfig = nextConfig;

  return cloneConfig(nextConfig);
}

function getWidgetConfigById(widgetId, config = getConfig()) {
  const id = String(widgetId);
  const widgetConfigs = config?.widgets;

  if (!widgetConfigs || typeof widgetConfigs !== 'object') {
    return {};
  }

  // New writes use the numeric key; this keeps historical `widget-<id>` entries readable.
  return widgetConfigs[id] || widgetConfigs[`widget-${id}`] || {};
}

function removeWidgetConfigs(widgetIds = []) {
  const keysToRemove = new Set(
    widgetIds
      .map((widgetId) => String(widgetId))
      .filter((widgetId) => /^\d+$/.test(widgetId))
      .flatMap((widgetId) => [widgetId, `widget-${widgetId}`])
  );

  if (!keysToRemove.size) {
    return 0;
  }

  const currentConfig = getConfig();
  const widgets = currentConfig.widgets || {};
  const nextWidgets = Object.fromEntries(
    Object.entries(widgets).filter(([key]) => !keysToRemove.has(key))
  );
  const removedCount = Object.keys(widgets).length - Object.keys(nextWidgets).length;

  if (!removedCount) {
    return 0;
  }

  const nextConfig = {
    ...currentConfig,
    widgets: nextWidgets
  };
  writeJsonFile(getConfigPath(), nextConfig);
  cachedConfig = nextConfig;

  return removedCount;
}

module.exports = {
  getConfig,
  updateConfig,
  resetConfig,
  updateWidgetConfig,
  getConfigPath,
  getDefaultConfig,
  normalizeThemeSettings,
  normalizeWidgetConfigKeys,
  getWidgetConfigById,
  removeWidgetConfigs
};
