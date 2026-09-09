const fs = require('fs');
const path = require('path');
const util = require('util');
const { app } = require('electron');

const MAX_LOG_FILE_SIZE = 3 * 1024 * 1024;
const MAX_LOG_FILE_COUNT = 14;
let logDirectory = '';
let consoleMirrored = false;
const originalConsole = {};

function getLogDirectory() {
  if (!logDirectory) {
    logDirectory = path.join(app.getPath('userData'), 'logs');
  }

  return logDirectory;
}

function getLogFileName(date = new Date()) {
  const day = [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0')
  ].join('-');

  return `desktop-widget-manager-${day}.log`;
}

function getLogFilePath(date = new Date()) {
  return path.join(getLogDirectory(), getLogFileName(date));
}

function formatValue(value) {
  if (value instanceof Error) {
    return value.stack || `${value.name}: ${value.message}`;
  }

  if (typeof value === 'string') {
    return value;
  }

  return util.inspect(value, {
    depth: 5,
    breakLength: 140,
    maxArrayLength: 100
  });
}

function rotateIfNeeded(filePath) {
  if (!fs.existsSync(filePath) || fs.statSync(filePath).size < MAX_LOG_FILE_SIZE) {
    return;
  }

  const extension = path.extname(filePath);
  const baseName = path.basename(filePath, extension);
  const archivePath = path.join(
    path.dirname(filePath),
    `${baseName}.${Date.now()}${extension}`
  );

  fs.renameSync(filePath, archivePath);
}

function removeExpiredLogs() {
  const directory = getLogDirectory();
  const logFiles = fs.readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /^desktop-widget-manager-.*\.log$/.test(entry.name))
    .map((entry) => {
      const filePath = path.join(directory, entry.name);

      return {
        filePath,
        modifiedAt: fs.statSync(filePath).mtimeMs
      };
    })
    .sort((first, second) => second.modifiedAt - first.modifiedAt);

  logFiles.slice(MAX_LOG_FILE_COUNT).forEach(({ filePath }) => {
    try {
      fs.unlinkSync(filePath);
    } catch (_) {
      // A failed cleanup must never prevent the application from writing logs.
    }
  });
}

function writeLog(level, values) {
  try {
    const directory = getLogDirectory();
    fs.mkdirSync(directory, { recursive: true });

    const filePath = getLogFilePath();
    rotateIfNeeded(filePath);
    const content = values.map(formatValue).join(' ');
    const line = `[${new Date().toISOString()}] [${String(level).toUpperCase()}] ${content}\n`;

    fs.appendFileSync(filePath, line, 'utf8');
  } catch (_) {
    // Logging must never take down the desktop application.
  }
}

function initializeLogging() {
  if (consoleMirrored) {
    return getLogFilePath();
  }

  try {
    fs.mkdirSync(getLogDirectory(), { recursive: true });
    removeExpiredLogs();
  } catch (_) {
    // The console remains available even if the user-data directory is read-only.
  }

  ['log', 'info', 'warn', 'error'].forEach((level) => {
    originalConsole[level] = console[level].bind(console);
    console[level] = (...values) => {
      originalConsole[level](...values);
      writeLog(level, values);
    };
  });
  consoleMirrored = true;
  console.info(`[logging] 持久化日志已启用：${getLogFilePath()}`);

  return getLogFilePath();
}

function logRendererDiagnostic(payload = {}) {
  const level = payload.level === 'warning' ? 'warn' : 'error';
  const values = [
    '[renderer]',
    payload.source || 'unknown',
    payload.message || '未知渲染层错误'
  ];

  if (payload.stack) {
    values.push(payload.stack);
  }

  writeLog(level, values);
  originalConsole[level]?.(...values);
}

module.exports = {
  getLogDirectory,
  getLogFilePath,
  initializeLogging,
  logRendererDiagnostic
};
