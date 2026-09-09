process.env.DWM_DISABLE_DESKTOP_ATTACHMENT = '1';

const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const outputRoot = path.join(projectRoot, 'output', 'qa', 'notes-persistence');
const userDataPath = path.join(outputRoot, 'user-data');
const reportPath = path.join(outputRoot, 'report.json');
const checks = [];

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function pass(name) {
  checks.push({ name, status: 'passed' });
  console.log(`[PASS] ${name}`);
}

async function run() {
  fs.rmSync(outputRoot, { recursive: true, force: true });
  fs.mkdirSync(userDataPath, { recursive: true });
  app.setPath('userData', userDataPath);
  await app.whenReady();

  const database = require('../electron/db/database');
  const noteService = require('../electron/services/noteService');
  const widgetService = require('../electron/services/widgetService');

  await database.initializeDatabase();
  const firstWidget = widgetService.createWidget({ type: 'notes', name: '便签 A' });
  const secondWidget = widgetService.createWidget({ type: 'notes', name: '便签 B' });
  const firstNote = noteService.createNote(firstWidget.id, {
    title: '重启持久化',
    content: '数据库关闭后重新打开仍应存在',
    category: '重要'
  });
  noteService.createNote(secondWidget.id, {
    title: '实例隔离',
    content: '只属于 B',
    category: '工作'
  });

  assert(noteService.getNotes(firstWidget.id).length === 1, '实例 A 便签数量错误。');
  assert(noteService.getNotes(secondWidget.id).length === 1, '实例 B 便签数量错误。');
  pass('不同快速便签实例按 widget_instance_id 隔离');

  noteService.updateNote(firstWidget.id, firstNote.id, {
    title: '已更新的持久化便签',
    content: '自动保存后的内容',
    category: '学习',
    isPinned: true
  });
  assert(noteService.searchNotes(firstWidget.id, '学习').length === 1, '分类搜索失败。');
  assert(noteService.searchNotes(firstWidget.id, '自动保存').length === 1, '正文搜索失败。');
  pass('更新、置顶与搜索写入 SQLite');

  database.closeDatabase();
  await database.initializeDatabase();
  const restored = noteService.getNoteById(firstWidget.id, firstNote.id);

  assert(restored?.title === '已更新的持久化便签', '数据库重开后标题未恢复。');
  assert(restored?.content === '自动保存后的内容', '数据库重开后正文未恢复。');
  assert(restored?.isPinned === true, '数据库重开后置顶状态未恢复。');
  pass('关闭并重新打开 SQLite 后便签数据恢复');

  widgetService.deleteWidget(firstWidget.id);
  assert(noteService.getNotes(firstWidget.id).length === 0, '删除组件实例后便签未级联清理。');
  assert(noteService.getNotes(secondWidget.id).length === 1, '删除实例 A 误删实例 B 数据。');
  pass('删除组件实例只清理其自身便签');

  fs.mkdirSync(outputRoot, { recursive: true });
  fs.writeFileSync(reportPath, `${JSON.stringify({
    generatedAt: new Date().toISOString(),
    passed: checks.length,
    failed: 0,
    checks
  }, null, 2)}\n`, 'utf8');
  database.closeDatabase();
}

run()
  .then(() => app.exit(0))
  .catch((error) => {
    console.error('[notes-persistence] 验证失败：', error);
    try {
      fs.mkdirSync(outputRoot, { recursive: true });
      fs.writeFileSync(reportPath, `${JSON.stringify({
        generatedAt: new Date().toISOString(),
        passed: checks.length,
        failed: 1,
        checks,
        error: error?.stack || String(error)
      }, null, 2)}\n`, 'utf8');
    } catch (reportError) {
      console.error('[notes-persistence] 写入报告失败：', reportError);
    }
    app.exit(1);
  });
