const { safeIpcHandle } = require('./safeIpc');
const { getConfig, updateConfig } = require('../services/configService');
const {
  getAutoStartSettings,
  updateAutoStartSettings
} = require('../services/autoStartService');

function registerConfigIpc(themeRuntimeService = {}) {
  // 读取本地配置：渲染进程只能通过 IPC 获取配置，不能直接读取文件系统。
  safeIpcHandle('get-config', () => getConfig(), {
    message: '读取设置失败，请稍后重试。',
    fallbackValue: {}
  });

  // 更新本地配置：主进程负责写入 config.json。
  safeIpcHandle('update-config', (event, newConfig) => {
    const nextConfig = updateConfig(newConfig);

    // 主题保存后立刻同步到所有已打开的小组件窗口，不需要等待重启。
    themeRuntimeService.applyThemeToAllWidgetWindows?.();

    return nextConfig;
  }, {
    message: '保存设置失败，请稍后重试。'
  });

  safeIpcHandle('get-auto-start-settings', () => {
    // 系统能力只在主进程读取，渲染进程只拿到安全的布尔状态。
    return getAutoStartSettings();
  }, {
    message: '读取开机自启动设置失败，请稍后重试。',
    fallbackValue: { autoStart: false }
  });

  safeIpcHandle('update-auto-start-settings', (event, enabled) => {
    // 开关变更同时写入 Windows 登录项和 config.json。
    return updateAutoStartSettings(enabled);
  }, {
    message: '保存开机自启动设置失败，请稍后重试。'
  });
}

module.exports = {
  registerConfigIpc
};
