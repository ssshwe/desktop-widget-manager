const fs = require('fs');
const path = require('path');
const { app, shell } = require('electron');
const { getConfig, getWidgetConfigById } = require('./configService');

function normalizeShortcutPaths(filePaths = []) {
  if (!Array.isArray(filePaths)) return [];

  return [...new Set(filePaths
    .filter((filePath) => typeof filePath === 'string' && filePath.trim())
    .map((filePath) => path.resolve(filePath)))]
    .slice(0, 200);
}

function formatFileType(filePath, isDirectory) {
  if (isDirectory) return '文件夹';
  const extension = path.extname(filePath).replace('.', '').toUpperCase();
  return extension || '文件';
}

async function getSystemIconDataUrl(filePath) {
  const shortcutDetails = getWindowsShortcutDetails(filePath);
  const iconCandidates = [
    shortcutDetails?.icon,
    shortcutDetails?.target,
    filePath
  ]
    .map(expandWindowsEnvironmentVariables)
    .filter((candidate, index, candidates) => (
      candidate
      && fs.existsSync(candidate)
      && candidates.indexOf(candidate) === index
    ));

  for (const candidate of iconCandidates) {
    try {
      const icon = await app.getFileIcon(candidate, { size: 'large' });
      if (icon && !icon.isEmpty()) return icon.toDataURL();
    } catch (error) {
      // 某个候选图标不可读时继续尝试快捷方式目标和 .lnk 本身。
    }
  }

  return '';
}

function expandWindowsEnvironmentVariables(filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) return '';

  const unquotedPath = filePath.trim().replace(/^"|"$/g, '');
  return unquotedPath.replace(/%([^%]+)%/g, (match, variableName) => {
    const matchedKey = Object.keys(process.env)
      .find((key) => key.toLowerCase() === String(variableName).toLowerCase());
    return matchedKey ? process.env[matchedKey] : match;
  });
}

function getWindowsShortcutDetails(filePath) {
  if (process.platform !== 'win32' || path.extname(filePath).toLowerCase() !== '.lnk') {
    return null;
  }

  try {
    return shell.readShortcutLink(filePath);
  } catch (error) {
    return null;
  }
}

async function resolveFloatingFolderFiles(filePaths = []) {
  const items = await Promise.all(normalizeShortcutPaths(filePaths).map(async (filePath) => {
    try {
      if (!fs.existsSync(filePath)) return null;

      const stat = fs.statSync(filePath);
      const isDirectory = stat.isDirectory();
      const shortcutDetails = getWindowsShortcutDetails(filePath);

      return {
        name: path.basename(filePath) || filePath,
        type: formatFileType(filePath, isDirectory),
        modifiedAt: stat.mtime.toISOString(),
        filePath,
        isDirectory,
        isExternalReference: true,
        shortcutTarget: shortcutDetails?.target || '',
        iconDataUrl: await getSystemIconDataUrl(filePath)
      };
    } catch (error) {
      return null;
    }
  }));

  return items.filter(Boolean);
}

function normalizeWidgetId(widgetId) {
  const id = Number(widgetId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('快捷收纳区标识无效。');
  }

  return id;
}

function getAuthorizedShortcutPaths(widgetId) {
  const id = normalizeWidgetId(widgetId);
  const config = getConfig();
  const widgetConfig = getWidgetConfigById(id, config);
  const addedFilePaths = widgetConfig.floatingFolder?.addedFilePaths;

  return new Set(normalizeShortcutPaths(addedFilePaths));
}

async function openPathWithSystem(filePath) {
  if (!filePath || typeof filePath !== 'string' || !fs.existsSync(filePath)) {
    throw new Error('快捷方式指向的文件、文件夹或应用不存在。');
  }

  const errorMessage = await shell.openPath(filePath);
  if (errorMessage) throw new Error(errorMessage);

  return {
    opened: true,
    path: filePath
  };
}

async function openFloatingFolderFile(widgetId, filePath) {
  if (typeof filePath !== 'string' || !filePath.trim()) {
    throw new Error('快捷项目路径无效。');
  }

  const normalizedPath = path.resolve(filePath);
  const authorizedPaths = getAuthorizedShortcutPaths(widgetId);

  if (!authorizedPaths.has(normalizedPath)) {
    throw new Error('该项目未添加到当前快捷收纳区。');
  }

  return openPathWithSystem(normalizedPath);
}

module.exports = {
  openFloatingFolderFile,
  resolveFloatingFolderFiles
};
