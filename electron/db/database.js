const fs = require('fs');
const path = require('path');
const initSqlJs = require('sql.js');
const { app } = require('electron');
const { writeFileAtomic } = require('../utils/atomicFile');

let db = null;
let SQL = null;
let dbPath = '';
let initSqlCache = '';
let schemaChecked = false;

const REQUIRED_TABLES = [
  'widgets',
  'todos',
  'notes',
  'schedules',
  'categories',
  'desktop_files',
  'floating_folders',
  'weather_settings',
  'desktop_organize_records'
];

function getDatabasePath() {
  // 数据库必须放在 Electron 的用户数据目录，避免写入项目源码目录。
  return path.join(app.getPath('userData'), 'desktop-widget-manager.sqlite');
}

function getWasmPath(fileName) {
  // sql.js 依赖 wasm 文件，显式指定路径可避免 Electron 打包和工作目录差异造成加载失败。
  const wasmPath = path.join(__dirname, '..', '..', 'node_modules', 'sql.js', 'dist', fileName);

  // 打包后 wasm 会被 electron-builder 解包到 app.asar.unpacked，避免 asar 内二进制加载失败。
  return wasmPath.includes('app.asar')
    ? wasmPath.replace('app.asar', 'app.asar.unpacked')
    : wasmPath;
}

function getInitSql() {
  if (!initSqlCache) {
    const initSqlPath = path.join(__dirname, 'init.sql');

    initSqlCache = fs.readFileSync(initSqlPath, 'utf8');
  }

  return initSqlCache;
}

function backupDatabaseFile(reason = 'broken') {
  if (!dbPath || !fs.existsSync(dbPath)) {
    return '';
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupPath = `${dbPath}.${reason}-${timestamp}.bak`;

  try {
    // 数据库损坏时先备份原文件，再创建新库，避免用户数据被静默覆盖。
    fs.copyFileSync(dbPath, backupPath);
    return backupPath;
  } catch (error) {
    console.error('[database] 备份损坏数据库失败：', error);
    return '';
  }
}

function persistDatabase() {
  if (!db || !dbPath) {
    return;
  }

  try {
    // sql.js 在内存中操作 SQLite，写入后需要导出并保存到本地数据库文件。
    const data = db.export();
    writeFileAtomic(dbPath, Buffer.from(data));
  } catch (error) {
    console.error(`[database] SQLite 数据库写入失败：${dbPath}`, error);
  }
}

function applyDatabaseSchema() {
  if (!db) {
    return;
  }

  db.run('PRAGMA foreign_keys = ON;');
  db.exec(getInitSql());
  schemaChecked = true;
}

function ensureDatabaseSchema() {
  if (!db) {
    return;
  }

  if (schemaChecked) {
    return;
  }

  try {
    const tableNameList = REQUIRED_TABLES.map((tableName) => `'${tableName}'`).join(',');
    const result = db.exec(`
      SELECT name
      FROM sqlite_master
      WHERE type = 'table'
        AND name IN (${tableNameList});
    `);
    const existingTables = new Set((result[0]?.values || []).map((row) => row[0]));
    const missingTables = REQUIRED_TABLES.filter((tableName) => !existingTables.has(tableName));

    if (!missingTables.length) {
      schemaChecked = true;
      return;
    }

    console.warn(`[database] 检测到数据库表缺失，正在自动修复：${missingTables.join(', ')}`);
    applyDatabaseSchema();
    persistDatabase();
  } catch (error) {
    console.error('[database] 检查或修复数据库表失败：', error);
    throw new Error('数据库结构异常，已阻止本次数据操作。');
  }
}

async function initializeDatabase() {
  if (db) {
    return db;
  }

  dbPath = getDatabasePath();
  const userDataDir = path.dirname(dbPath);

  // 确保用户数据目录存在，SQLite 会在目标文件不存在时自动创建数据库文件。
  fs.mkdirSync(userDataDir, { recursive: true });

  try {
    SQL = await initSqlJs({
      locateFile: getWasmPath
    });
  } catch (error) {
    console.error('[database] sql.js 初始化失败：', error);
    throw new Error('SQLite 引擎初始化失败，请检查应用文件是否完整。');
  }

  try {
    if (fs.existsSync(dbPath)) {
      // 数据库文件已存在时读取旧数据，保证重复启动不会丢失本地业务数据。
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
    } else {
      // 数据库文件不存在时创建新的 SQLite 数据库。
      db = new SQL.Database();
    }
  } catch (error) {
    const backupPath = backupDatabaseFile('broken');

    console.error(`[database] SQLite 数据库连接失败，已尝试备份并重建。备份文件：${backupPath || '无'}`, error);
    db = new SQL.Database();
  }

  try {
    // 使用 CREATE TABLE IF NOT EXISTS，重复启动或缺表修复时都不会重复建表。
    applyDatabaseSchema();
    persistDatabase();
  } catch (error) {
    if (fs.existsSync(dbPath)) {
      const backupPath = backupDatabaseFile('broken');

      console.error(`[database] SQLite 表结构初始化失败，已备份并重建数据库。备份文件：${backupPath || '无'}`, error);
      db?.close?.();
      db = new SQL.Database();
      schemaChecked = false;
      applyDatabaseSchema();
      persistDatabase();
    } else {
      console.error('[database] SQLite 初始化表结构失败：', error);
      throw new Error('数据库表初始化失败，请检查用户数据目录权限。');
    }
  }

  console.log(`[database] SQLite 数据库已初始化：${dbPath}`);

  return db;
}

function getDatabase() {
  if (!db) {
    throw new Error('SQLite 数据库暂不可用，请稍后重试。');
  }

  // 表结构启动时已检查，运行期只在未确认结构时补查，避免每次查询都访问 sqlite_master。
  ensureDatabaseSchema();

  return db;
}

function closeDatabase() {
  if (db) {
    persistDatabase();
    db.close();
    db = null;
    schemaChecked = false;
  }
}

module.exports = {
  initializeDatabase,
  ensureDatabaseSchema,
  getDatabase,
  getDatabasePath,
  persistDatabase,
  closeDatabase
};
