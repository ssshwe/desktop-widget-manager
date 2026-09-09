const { app } = require('electron');
const { getConfig, updateConfig } = require('./configService');

function getLoginItemArgs() {
  if (app.isPackaged) {
    return [];
  }

  // 开发环境下 process.execPath 指向 electron.exe，需要附带项目路径才能正确启动当前应用。
  return [app.getAppPath()];
}

function getLoginItemIdentityOptions() {
  return {
    path: process.execPath,
    args: getLoginItemArgs()
  };
}

function getLoginItemOptions(openAtLogin) {
  return {
    ...getLoginItemIdentityOptions(),
    openAtLogin: Boolean(openAtLogin)
  };
}

function readSystemAutoStartEnabled() {
  try {
    return Boolean(app.getLoginItemSettings(getLoginItemIdentityOptions()).openAtLogin);
  } catch (error) {
    console.error('[auto-start] 读取系统开机自启动状态失败：', error);
    return false;
  }
}

function setSystemAutoStartEnabled(enabled) {
  // Electron 统一调用系统登录项设置，Windows 下会写入当前应用的开机启动项。
  app.setLoginItemSettings(getLoginItemOptions(enabled));
}

function getAutoStartSettings() {
  const config = getConfig();

  return {
    autoStart: Boolean(config.autoStart),
    systemAutoStart: readSystemAutoStartEnabled()
  };
}

function updateAutoStartSettings(enabled) {
  const autoStart = Boolean(enabled);

  setSystemAutoStartEnabled(autoStart);

  // 开关状态保存到 config.json，重启管理中心后按该值恢复界面。
  const config = updateConfig({
    autoStart
  });

  return {
    autoStart: Boolean(config.autoStart),
    systemAutoStart: readSystemAutoStartEnabled()
  };
}

function syncAutoStartWithConfig() {
  try {
    const config = getConfig();

    // 软件启动时把 config.json 中的偏好同步给系统登录项，避免系统状态和界面状态不一致。
    setSystemAutoStartEnabled(Boolean(config.autoStart));
  } catch (error) {
    console.error('[auto-start] 同步开机自启动设置失败：', error);
  }
}

module.exports = {
  getAutoStartSettings,
  syncAutoStartWithConfig,
  updateAutoStartSettings
};
