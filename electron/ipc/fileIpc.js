const { BrowserWindow, dialog } = require('electron');
const { safeIpcHandle } = require('./safeIpc');
const {
  openFloatingFolderFile,
  resolveFloatingFolderFiles
} = require('../services/floatingFolderService');

function getDialogParentWindow(event) {
  return BrowserWindow.fromWebContents(event.sender);
}

function registerFileIpc() {
  safeIpcHandle('choose-floating-folder-items', async (event) => {
    const parentWindow = getDialogParentWindow(event);
    const dialogOptions = {
      title: '添加文件或应用快捷方式',
      buttonLabel: '添加到当前分区',
      properties: ['openFile', 'multiSelections']
    };
    const result = parentWindow
      ? await dialog.showOpenDialog(parentWindow, dialogOptions)
      : await dialog.showOpenDialog(dialogOptions);

    if (result.canceled || !result.filePaths.length) {
      return { canceled: true, filePaths: [] };
    }

    return {
      canceled: false,
      filePaths: result.filePaths
    };
  }, {
    message: '添加快捷方式失败，请确认文件或应用仍然存在。',
    fallback: (error, message) => ({
      canceled: true,
      filePaths: [],
      message
    })
  });

  safeIpcHandle('resolve-floating-folder-files', (event, filePaths) => {
    return resolveFloatingFolderFiles(filePaths);
  }, {
    message: '读取快捷方式失败。',
    fallbackValue: []
  });

  safeIpcHandle('open-floating-folder-file', (event, widgetId, filePath) => {
    return openFloatingFolderFile(widgetId, filePath);
  }, {
    message: '无法打开该快捷项目，请刷新后重试。'
  });
}

module.exports = {
  registerFileIpc
};
