const { safeIpcHandle } = require('./safeIpc');
const {
  getDesktopFiles,
  organizeDesktopFiles,
  previewDesktopOrganization,
  scanDesktopFiles
} = require('../services/desktopFileService');

function registerDesktopFileIpc() {
  safeIpcHandle('get-desktop-files', () => getDesktopFiles(), {
    message: '读取桌面文件列表失败，请稍后重试。',
    fallback: (error, message) => ({
      success: false,
      files: [],
      categories: [],
      message
    })
  });

  safeIpcHandle('scan-desktop-files', async () => {
    // 桌面扫描涉及文件系统和 SQLite 写入，只允许在主进程服务中执行。
    const result = await scanDesktopFiles();

    return result;
  }, {
    message: '桌面扫描失败，请检查桌面目录权限后重试。',
    fallback: (error, message) => ({
      success: false,
      files: [],
      categories: [],
      count: 0,
      message
    })
  });

  safeIpcHandle('preview-desktop-organization', async () => {
    const result = await previewDesktopOrganization();

    return result;
  }, {
    message: '生成整理预览失败，请稍后重试。',
    fallback: (error, message) => ({
      success: false,
      entries: [],
      moveCount: 0,
      skipCount: 0,
      categoryCounts: {},
      message
    })
  });

  safeIpcHandle('organize-desktop-files', async (event, options) => {
    // 移动文件前必须带有预览 token 和确认标记，防止渲染进程绕过预览直接整理。
    const result = await organizeDesktopFiles(options);

    return result;
  }, {
    message: '整理桌面失败，未删除任何文件，请检查权限后重试。',
    fallback: (error, message) => ({
      success: false,
      records: [],
      files: [],
      movedCount: 0,
      failedCount: 0,
      skippedCount: 0,
      message
    })
  });
}

module.exports = {
  registerDesktopFileIpc
};
