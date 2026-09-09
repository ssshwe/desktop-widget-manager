const { ipcMain } = require('electron');
const { isTrustedLocalUrl } = require('../security/windowSecurity');

function getFriendlyErrorMessage(error, fallbackMessage = '操作失败，请稍后重试。') {
  const message = error?.message || '';

  if (/no such table|数据库表/.test(message)) {
    return '本地数据库结构异常，系统已尝试自动修复，请重试。';
  }

  if (/SQLite|database|数据库/.test(message)) {
    return '本地数据库暂不可用，请稍后重试。';
  }

  if (/permission|access|EPERM|EACCES|权限/i.test(message)) {
    return '权限不足，无法完成操作，请检查文件或目录权限。';
  }

  if (/ENOENT|不存在|not found/i.test(message)) {
    return '目标文件或文件夹不存在，请确认后重试。';
  }

  return fallbackMessage;
}

function safeIpcHandle(channel, handler, options = {}) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      if (!isTrustedLocalUrl(event.senderFrame?.url || event.sender?.getURL?.())) {
        throw new Error('不受信任的页面不能调用应用功能。');
      }

      return await handler(event, ...args);
    } catch (error) {
      const message = getFriendlyErrorMessage(error, options.message);

      // IPC 层统一记录通道名和原始异常，方便定位是哪一个功能失败。
      console.error(`[ipc:${channel}] ${message}`, error);

      if (typeof options.fallback === 'function') {
        return options.fallback(error, message, event, ...args);
      }

      if (Object.prototype.hasOwnProperty.call(options, 'fallbackValue')) {
        return options.fallbackValue;
      }

      return {
        success: false,
        message
      };
    }
  });
}

module.exports = {
  getFriendlyErrorMessage,
  safeIpcHandle
};
