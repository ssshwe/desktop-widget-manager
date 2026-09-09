const { execFile } = require('child_process');
const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getDatabase, persistDatabase } = require('../db/database');

const DEFAULT_CATEGORY_RULES = [
  {
    name: '学习',
    description: '课程、资料、课件、论文等学习相关文件。',
    rule: {
      extensions: ['doc', 'docx', 'pdf', 'ppt', 'pptx'],
      keywords: ['学习', '课程', '课件', '教程', '笔记', '作业', '论文', '资料', '考试', 'study', 'course', 'lesson', 'note', 'homework', 'paper', 'tutorial']
    }
  },
  {
    name: '工作',
    description: '会议、项目、报表、合同、表格等工作相关文件。',
    rule: {
      extensions: ['xls', 'xlsx', 'csv'],
      keywords: ['工作', '会议', '项目', '报告', '合同', '发票', '简历', '客户', '需求', '方案', '报价', '预算', 'work', 'meeting', 'project', 'report', 'contract', 'invoice', 'resume', 'client', 'proposal', 'budget']
    }
  },
  {
    name: '娱乐',
    description: '视频、音乐、游戏、影视和直播相关文件。',
    rule: {
      extensions: ['mp4', 'mp3', 'avi'],
      keywords: ['娱乐', '游戏', '视频', '音乐', '电影', '影视', '直播', 'steam', 'game', 'music', 'movie', 'video', 'player', 'bili', 'youtube', '抖音', '爱奇艺', '腾讯视频', '优酷']
    }
  },
  {
    name: '工具',
    description: '软件、安装包、开发工具、浏览器和快捷工具。',
    rule: {
      extensions: [],
      keywords: ['工具', '软件', '安装', '卸载', '压缩', '浏览器', '编辑器', '开发', '代码', '截图', '助手', '微信', '企业微信', 'qq', 'tool', 'app', 'setup', 'install', 'uninstall', 'zip', 'browser', 'chrome', 'edge', 'firefox', 'editor', 'vscode', 'code', 'utility', 'helper', 'devtool']
    }
  },
  {
    name: '其他',
    description: '无法通过扩展名或关键词识别的桌面文件。',
    rule: {
      extensions: [],
      keywords: []
    }
  }
];

const SHORTCUT_EXTENSIONS = new Set(['exe', 'lnk', 'url']);
const DEFAULT_CATEGORY_FOLDER_NAMES = new Set(DEFAULT_CATEGORY_RULES.map((category) => category.name));
let latestOrganizePreview = null;

function ensureDesktopFilesSchema() {
  const db = getDatabase();
  const result = db.exec('PRAGMA table_info(desktop_files);');
  const columns = new Set((result[0]?.values || []).map((row) => row[1]));

  if (!columns.has('modified_at')) {
    // 兼容旧版本数据库，补充桌面文件最近修改时间字段。
    db.run('ALTER TABLE desktop_files ADD COLUMN modified_at TEXT;');
    persistDatabase();
  }
}

function ensureOrganizeRecordsSchema() {
  const db = getDatabase();

  // 整理记录按文件保存，方便后续查看每个文件的移动结果和失败原因。
  db.run(`
    CREATE TABLE IF NOT EXISTS desktop_organize_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id TEXT NOT NULL,
      file_name TEXT NOT NULL,
      source_path TEXT NOT NULL,
      target_path TEXT,
      category_id INTEGER,
      category_name TEXT NOT NULL,
      status TEXT NOT NULL,
      error_message TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
    );
  `);

  persistDatabase();
}

function parseCategoryRule(ruleText) {
  if (!ruleText) {
    return null;
  }

  try {
    const rule = JSON.parse(ruleText);

    if (!rule || !Array.isArray(rule.extensions) || !Array.isArray(rule.keywords)) {
      return null;
    }

    return {
      extensions: rule.extensions.map((extension) => String(extension).toLowerCase().replace(/^\./, '')),
      keywords: rule.keywords.map((keyword) => String(keyword).toLowerCase()).filter(Boolean)
    };
  } catch (error) {
    return null;
  }
}

function getDefaultCategoryConfig(categoryName) {
  return DEFAULT_CATEGORY_RULES.find((category) => category.name === categoryName) || null;
}

function readCategoryByName(categoryName) {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT id, name, rule, description
    FROM categories
    WHERE name = ?
    LIMIT 1
  `);
  let category = null;

  statement.bind([categoryName]);

  if (statement.step()) {
    category = statement.getAsObject();
  }

  statement.free();

  return category;
}

function ensureDefaultCategories() {
  const db = getDatabase();
  let changed = false;

  DEFAULT_CATEGORY_RULES.forEach((category) => {
    const currentCategory = readCategoryByName(category.name);
    const ruleText = JSON.stringify(category.rule);

    if (!currentCategory) {
      // 默认分类规则保存到 SQLite，后续分类预览和整理操作都从同一张表读取规则。
      db.run(
        `
          INSERT INTO categories (name, rule, description, created_at, updated_at)
          VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [category.name, ruleText, category.description]
      );
      changed = true;
      return;
    }

    if (!parseCategoryRule(currentCategory.rule)) {
      // 兼容历史空规则或损坏规则，保留分类 ID，只修复默认规则内容。
      db.run(
        `
          UPDATE categories
          SET rule = ?, description = ?, updated_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        [ruleText, currentCategory.description || category.description, currentCategory.id]
      );
      changed = true;
    }
  });

  if (changed) {
    persistDatabase();
  }

  return getDesktopCategories();
}

function getDesktopCategories() {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT id, name, rule, description, created_at, updated_at
    FROM categories
    ORDER BY
      CASE name
        WHEN '学习' THEN 1
        WHEN '工作' THEN 2
        WHEN '娱乐' THEN 3
        WHEN '工具' THEN 4
        WHEN '其他' THEN 5
        ELSE 99
      END,
      id ASC
  `);
  const categories = [];

  while (statement.step()) {
    const row = statement.getAsObject();
    const defaultConfig = getDefaultCategoryConfig(row.name);

    categories.push({
      id: row.id,
      name: row.name,
      rule: parseCategoryRule(row.rule) || defaultConfig?.rule || { extensions: [], keywords: [] },
      description: row.description || defaultConfig?.description || '',
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  statement.free();

  return categories;
}

function getDesktopPath() {
  // 使用 Electron 提供的当前用户桌面目录，避免在渲染进程拼接系统路径。
  return app.getPath('desktop');
}

function normalizeJsonResult(stdout) {
  const jsonText = stdout ? stdout.replace(/^\uFEFF/, '').trim() : '';

  if (!jsonText) {
    return [];
  }

  const parsed = JSON.parse(jsonText);

  return Array.isArray(parsed) ? parsed : [parsed];
}

function getFileType(item) {
  if (item.isDirectory) {
    return '文件夹';
  }

  const extension = String(item.extension || '').toLowerCase();

  if (extension === '.lnk' || extension === '.url') {
    return '快捷方式';
  }

  return extension ? `${extension.replace('.', '').toUpperCase()} 文件` : '文件';
}

function mapScannedItem(item) {
  return {
    fileName: item.name,
    filePath: item.path,
    fileType: getFileType(item),
    isDirectory: Boolean(item.isDirectory),
    modifiedAt: item.modifiedAt
  };
}

function runDesktopScan(desktopPath) {
  const script = `
    & {
    $ErrorActionPreference = 'Stop'
    [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
    $OutputEncoding = [System.Text.Encoding]::UTF8
    $desktopPath = $env:DWM_DESKTOP_PATH

    if (-not (Test-Path -LiteralPath $desktopPath -PathType Container)) {
      throw '桌面目录不存在或不可访问'
    }

    $items = @(
      Get-ChildItem -LiteralPath $desktopPath -Force | Where-Object {
        -not ($_.Attributes -band [System.IO.FileAttributes]::Hidden) -and
        -not ($_.Attributes -band [System.IO.FileAttributes]::System)
      } | ForEach-Object {
        [PSCustomObject]@{
          name = $_.Name
          path = $_.FullName
          isDirectory = [bool]$_.PSIsContainer
          extension = if ($_.PSIsContainer) { '' } else { $_.Extension }
          modifiedAt = $_.LastWriteTime.ToUniversalTime().ToString('o')
        }
      }
    )

    $items | ConvertTo-Json -Depth 3 -Compress
    }
  `;

  return new Promise((resolve, reject) => {
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script],
      {
        encoding: 'utf8',
        env: {
          ...process.env,
          DWM_DESKTOP_PATH: desktopPath
        },
        windowsHide: true,
        maxBuffer: 1024 * 1024 * 4
      },
      (error, stdout, stderr) => {
        if (error) {
          const message = stderr?.trim() || error.message;
          reject(new Error(message));
          return;
        }

        try {
          resolve(normalizeJsonResult(stdout).map(mapScannedItem));
        } catch (parseError) {
          reject(parseError);
        }
      }
    );
  });
}

function getCategoryByName(categories, categoryName) {
  return categories.find((category) => category.name === categoryName)
    || categories.find((category) => category.name === '其他')
    || categories[0];
}

function getFileExtension(file) {
  if (file.isDirectory || file.fileType === '文件夹') {
    return '';
  }

  return path.extname(file.fileName || file.filePath || '')
    .replace('.', '')
    .toLowerCase();
}

function findKeywordMatch(file, categories, categoryNames) {
  const text = String(file.fileName || '').toLowerCase();

  for (const categoryName of categoryNames) {
    const category = getCategoryByName(categories, categoryName);
    const matchedKeyword = category?.rule?.keywords?.find((keyword) => text.includes(keyword));

    if (matchedKeyword) {
      return {
        category,
        matchedKeyword
      };
    }
  }

  return null;
}

function createSuggestion(category, reason, matchedBy = 'fallback') {
  return {
    categoryId: category?.id || null,
    categoryName: category?.name || '其他',
    reason,
    matchedBy
  };
}

function suggestDesktopFileCategory(file, categories) {
  const extension = getFileExtension(file);
  const otherCategory = getCategoryByName(categories, '其他');
  const shortcutCategoryNames = ['娱乐', '工具'];
  const generalCategoryNames = ['工作', '学习', '娱乐', '工具'];
  const shortcutMatch = SHORTCUT_EXTENSIONS.has(extension)
    ? findKeywordMatch(file, categories, shortcutCategoryNames)
    : null;

  if (shortcutMatch) {
    return createSuggestion(
      shortcutMatch.category,
      `程序或快捷方式名称命中“${shortcutMatch.matchedKeyword}”关键词`,
      'keyword'
    );
  }

  if (SHORTCUT_EXTENSIONS.has(extension)) {
    return createSuggestion(otherCategory, '程序或快捷方式名称未命中工具/娱乐关键词', 'fallback');
  }

  const keywordMatch = findKeywordMatch(file, categories, generalCategoryNames);

  if (keywordMatch) {
    return createSuggestion(keywordMatch.category, `文件名命中“${keywordMatch.matchedKeyword}”关键词`, 'keyword');
  }

  const extensionMatch = categories.find((category) => category.rule.extensions.includes(extension));

  if (extensionMatch) {
    return createSuggestion(extensionMatch, `扩展名 .${extension} 命中${extensionMatch.name}规则`, 'extension');
  }

  // 未识别的文件统一进入“其他”，保证整理前每个文件都有明确预览结果。
  return createSuggestion(otherCategory, '未命中扩展名或关键词规则', 'fallback');
}

function applyCategorySuggestions(files, categories) {
  return files.map((file) => {
    const suggestion = suggestDesktopFileCategory(file, categories);

    return {
      ...file,
      categoryId: suggestion.categoryId,
      categoryName: suggestion.categoryName,
      categoryReason: suggestion.reason,
      categoryMatchedBy: suggestion.matchedBy
    };
  });
}

function isSamePath(leftPath, rightPath) {
  const normalizeForCompare = (targetPath) => {
    try {
      return fs.realpathSync.native(targetPath).toLowerCase();
    } catch (error) {
      return path.resolve(targetPath).toLowerCase();
    }
  };

  return normalizeForCompare(leftPath) === normalizeForCompare(rightPath);
}

function isDirectDesktopItem(filePath, desktopPath) {
  return isSamePath(path.dirname(filePath), desktopPath);
}

function isDefaultCategoryFolder(file) {
  return (file.isDirectory || file.fileType === '文件夹')
    && DEFAULT_CATEGORY_FOLDER_NAMES.has(file.fileName);
}

function getUniqueTargetPath(targetPath, reservedTargetPaths) {
  const parsedPath = path.parse(targetPath);
  let candidatePath = targetPath;
  let index = 1;

  while (fs.existsSync(candidatePath) || reservedTargetPaths.has(path.normalize(candidatePath).toLowerCase())) {
    candidatePath = path.join(parsedPath.dir, `${parsedPath.name} (${index})${parsedPath.ext}`);
    index += 1;
  }

  reservedTargetPaths.add(path.normalize(candidatePath).toLowerCase());

  return candidatePath;
}

function createPreviewToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function buildOrganizePreviewEntries(files, desktopPath) {
  const reservedTargetPaths = new Set();

  return files.map((file) => {
    const categoryName = file.categoryName || '其他';
    const targetFolderPath = path.join(desktopPath, categoryName);
    const targetPath = getUniqueTargetPath(
      path.join(targetFolderPath, path.basename(file.filePath)),
      reservedTargetPaths
    );

    if (isDefaultCategoryFolder(file)) {
      return {
        ...file,
        action: 'skip',
        sourcePath: file.filePath,
        targetFolderPath,
        targetPath: file.filePath,
        status: 'skipped',
        previewReason: '分类文件夹不会被再次移动'
      };
    }

    if (!isDirectDesktopItem(file.filePath, desktopPath)) {
      return {
        ...file,
        action: 'skip',
        sourcePath: file.filePath,
        targetFolderPath,
        targetPath: file.filePath,
        status: 'skipped',
        previewReason: '不是桌面根目录项目，已跳过'
      };
    }

    return {
      ...file,
      action: 'move',
      sourcePath: file.filePath,
      targetFolderPath,
      targetPath,
      status: 'pending',
      previewReason: `将移动到“${categoryName}”文件夹`
    };
  });
}

function summarizePreviewEntries(entries) {
  return entries.reduce((summary, entry) => {
    if (entry.action === 'move') {
      summary.moveCount += 1;
    } else {
      summary.skipCount += 1;
    }

    summary.categoryCounts[entry.categoryName] = (summary.categoryCounts[entry.categoryName] || 0) + 1;

    return summary;
  }, {
    moveCount: 0,
    skipCount: 0,
    categoryCounts: {}
  });
}

function saveOrganizeRecords(runId, records) {
  ensureOrganizeRecordsSchema();

  const db = getDatabase();

  db.run('BEGIN TRANSACTION;');

  try {
    records.forEach((record) => {
      db.run(
        `
          INSERT INTO desktop_organize_records (
            run_id,
            file_name,
            source_path,
            target_path,
            category_id,
            category_name,
            status,
            error_message,
            created_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `,
        [
          runId,
          record.fileName,
          record.sourcePath,
          record.targetPath || null,
          record.categoryId || null,
          record.categoryName || '其他',
          record.status,
          record.errorMessage || null
        ]
      );
    });

    db.run('COMMIT;');
    persistDatabase();
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

function saveDesktopFiles(files) {
  ensureDesktopFilesSchema();

  const db = getDatabase();

  // 扫描结果以桌面当前状态为准，分类建议会写入 category_id 供预览和后续整理复用。
  db.run('BEGIN TRANSACTION;');

  try {
    db.run('DELETE FROM desktop_files;');

    files.forEach((file) => {
      db.run(
        `
          INSERT INTO desktop_files (
            file_name,
            file_path,
            category_id,
            file_type,
            modified_at,
            created_at,
            updated_at
          )
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `,
        [
          file.fileName,
          file.filePath,
          file.categoryId || null,
          file.fileType,
          file.modifiedAt
        ]
      );
    });

    db.run('COMMIT;');
    persistDatabase();
  } catch (error) {
    db.run('ROLLBACK;');
    throw error;
  }
}

function readDesktopFilesFromDatabase() {
  ensureDesktopFilesSchema();

  const categories = ensureDefaultCategories();

  const db = getDatabase();
  const statement = db.prepare(`
    SELECT
      id,
      file_name,
      file_path,
      category_id,
      file_type,
      modified_at,
      created_at,
      updated_at
    FROM desktop_files
    ORDER BY modified_at DESC, file_name ASC
  `);
  const files = [];

  while (statement.step()) {
    const row = statement.getAsObject();

    files.push({
      id: row.id,
      fileName: row.file_name,
      filePath: row.file_path,
      categoryId: row.category_id,
      fileType: row.file_type || '文件',
      modifiedAt: row.modified_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    });
  }

  statement.free();

  return applyCategorySuggestions(files, categories);
}

function safeReadDesktopFilesFromDatabase() {
  try {
    return readDesktopFilesFromDatabase();
  } catch (error) {
    console.error('[desktop-files] 读取已保存桌面文件列表失败：', error);
    return [];
  }
}

function safeEnsureDefaultCategories() {
  try {
    return ensureDefaultCategories();
  } catch (error) {
    console.error('[desktop-files] 读取或修复默认分类失败：', error);
    return DEFAULT_CATEGORY_RULES.map((category, index) => ({
      id: index + 1,
      name: category.name,
      rule: category.rule,
      description: category.description
    }));
  }
}

function createFriendlyScanError(error) {
  const detail = error?.message ? `（${error.message}）` : '';

  return `无法读取桌面文件，请检查桌面目录权限后重试。${detail}`;
}

async function scanDesktopFiles() {
  const desktopPath = getDesktopPath();
  const categories = safeEnsureDefaultCategories();

  try {
    ensureDesktopFilesSchema();

    const files = applyCategorySuggestions(await runDesktopScan(desktopPath), categories);
    saveDesktopFiles(files);

    return {
      success: true,
      desktopPath,
      categories,
      files,
      count: files.length,
      message: `已扫描 ${files.length} 个桌面项目。`
    };
  } catch (error) {
    console.error('[desktop-files] 桌面文件扫描失败：', error);

    return {
      success: false,
      desktopPath,
      categories,
      files: safeReadDesktopFilesFromDatabase(),
      count: 0,
      message: createFriendlyScanError(error)
    };
  }
}

function getDesktopFiles() {
  try {
    const categories = ensureDefaultCategories();

    return {
      success: true,
      desktopPath: getDesktopPath(),
      categories,
      files: readDesktopFilesFromDatabase()
    };
  } catch (error) {
    console.error('[desktop-files] 获取桌面文件列表失败：', error);

    return {
      success: false,
      desktopPath: getDesktopPath(),
      categories: safeEnsureDefaultCategories(),
      files: [],
      message: '读取已保存的桌面文件列表失败，请稍后重试。'
    };
  }
}

async function refreshDesktopFilesAfterOrganize(desktopPath, categories) {
  const refreshedFiles = applyCategorySuggestions(await runDesktopScan(desktopPath), categories);

  saveDesktopFiles(refreshedFiles);

  return refreshedFiles;
}

async function previewDesktopOrganization() {
  const desktopPath = getDesktopPath();
  const categories = safeEnsureDefaultCategories();

  try {
    ensureDesktopFilesSchema();
    ensureOrganizeRecordsSchema();

    const files = applyCategorySuggestions(await runDesktopScan(desktopPath), categories);

    saveDesktopFiles(files);

    const entries = buildOrganizePreviewEntries(files, desktopPath);
    const summary = summarizePreviewEntries(entries);
    const previewToken = createPreviewToken();

    latestOrganizePreview = {
      previewToken,
      desktopPath,
      entries,
      createdAt: Date.now()
    };

    return {
      success: true,
      previewToken,
      desktopPath,
      categories,
      entries,
      ...summary,
      message: `整理预览已生成：${summary.moveCount} 个项目将被移动，${summary.skipCount} 个项目将跳过。`
    };
  } catch (error) {
    console.error('[desktop-files] 生成桌面整理预览失败：', error);

    return {
      success: false,
      desktopPath,
      categories,
      entries: [],
      moveCount: 0,
      skipCount: 0,
      categoryCounts: {},
      message: createFriendlyScanError(error)
    };
  }
}

async function organizeDesktopFiles(options = {}) {
  try {
    ensureDesktopFilesSchema();
    ensureOrganizeRecordsSchema();
  } catch (error) {
    console.error('[desktop-files] 整理前检查数据库结构失败：', error);

    return {
      success: false,
      records: [],
      files: safeReadDesktopFilesFromDatabase(),
      message: '数据库暂不可用，无法执行桌面整理，请稍后重试。'
    };
  }

  if (!options.confirmed) {
    return {
      success: false,
      records: [],
      files: safeReadDesktopFilesFromDatabase(),
      message: '请先查看整理预览并确认后再执行整理。'
    };
  }

  if (!latestOrganizePreview || latestOrganizePreview.previewToken !== options.previewToken) {
    return {
      success: false,
      records: [],
      files: safeReadDesktopFilesFromDatabase(),
      message: '整理预览已失效，请重新点击“一键整理”生成预览。'
    };
  }

  const desktopPath = latestOrganizePreview.desktopPath;
  const categories = ensureDefaultCategories();
  const runId = createPreviewToken();
  const reservedTargetPaths = new Set();
  const records = latestOrganizePreview.entries.map((entry) => {
    if (entry.action !== 'move') {
      return {
        ...entry,
        status: 'skipped',
        errorMessage: entry.previewReason || '已跳过'
      };
    }

    try {
      if (!fs.existsSync(entry.sourcePath)) {
        throw new Error('源文件不存在，可能已被移动或删除');
      }

      const targetFolderPath = path.join(desktopPath, entry.categoryName || '其他');
      const targetPath = getUniqueTargetPath(
        path.join(targetFolderPath, path.basename(entry.sourcePath)),
        reservedTargetPaths
      );

      // 确认整理后才创建分类文件夹并移动文件；同名文件通过自动重命名避免覆盖。
      fs.mkdirSync(targetFolderPath, { recursive: true });
      fs.renameSync(entry.sourcePath, targetPath);

      return {
        ...entry,
        targetFolderPath,
        targetPath,
        status: 'moved',
        errorMessage: ''
      };
    } catch (error) {
      console.error(`[desktop-files] 移动文件失败：${entry.sourcePath} -> ${entry.targetPath}`, error);

      return {
        ...entry,
        status: 'failed',
        errorMessage: error?.message || '移动失败'
      };
    }
  });

  let recordErrorMessage = '';

  try {
    saveOrganizeRecords(runId, records);
  } catch (error) {
    recordErrorMessage = error?.message || '整理记录保存失败';
  }

  let files = safeReadDesktopFilesFromDatabase();
  let refreshErrorMessage = '';

  try {
    files = await refreshDesktopFilesAfterOrganize(desktopPath, categories);
  } catch (error) {
    refreshErrorMessage = error?.message || '整理后刷新桌面列表失败';
  }

  latestOrganizePreview = null;

  const movedCount = records.filter((record) => record.status === 'moved').length;
  const failedCount = records.filter((record) => record.status === 'failed').length;
  const skippedCount = records.filter((record) => record.status === 'skipped').length;
  const messageParts = [`整理完成：成功移动 ${movedCount} 个，跳过 ${skippedCount} 个，失败 ${failedCount} 个。`];

  if (refreshErrorMessage) {
    messageParts.push(`列表刷新失败：${refreshErrorMessage}`);
  }

  if (recordErrorMessage) {
    messageParts.push(`记录保存失败：${recordErrorMessage}`);
  }

  return {
    success: failedCount === 0 && !refreshErrorMessage && !recordErrorMessage,
    runId,
    desktopPath,
    records,
    movedCount,
    failedCount,
    skippedCount,
    files,
    message: messageParts.join(' ')
  };
}

module.exports = {
  getDesktopCategories,
  getDesktopFiles,
  organizeDesktopFiles,
  previewDesktopOrganization,
  scanDesktopFiles
};
