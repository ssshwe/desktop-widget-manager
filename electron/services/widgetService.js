const { getDatabase, persistDatabase } = require('../db/database');
const { removeWidgetConfigs } = require('./configService');

const DEFAULT_WIDGET_NAMES = {
  clock: '时钟小组件',
  weather: '天气小组件',
  todo: '待办事项',
  notes: '快速便签',
  schedule: '日程提醒',
  floatingFolder: '快捷收纳区'
};

function normalizeWidgetId(widgetId) {
  const id = Number(widgetId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('小组件 ID 必须是正整数。');
  }

  return id;
}

function getWidgetList() {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT
      id,
      name,
      type,
      visible,
      pinned,
      locked,
      created_at,
      updated_at
    FROM widgets
    ORDER BY id DESC
  `);
  const widgets = [];

  while (statement.step()) {
    widgets.push(statement.getAsObject());
  }

  statement.free();

  return widgets;
}

function getVisibleWidgetList() {
  return getWidgetList().filter((widget) => Number(widget.visible) === 1);
}

function getWidgetById(widgetId) {
  const db = getDatabase();
  const id = normalizeWidgetId(widgetId);
  const statement = db.prepare(`
    SELECT
      id,
      name,
      type,
      visible,
      pinned,
      locked,
      created_at,
      updated_at
    FROM widgets
    WHERE id = ?
  `);
  let widget = null;

  statement.bind([id]);

  if (statement.step()) {
    widget = statement.getAsObject();
  }

  statement.free();

  return widget;
}

function createWidget(widgetData = {}) {
  const db = getDatabase();
  const type = typeof widgetData.type === 'string' && widgetData.type.trim()
    ? widgetData.type.trim()
    : 'clock';
  const supportedTypes = new Set(Object.keys(DEFAULT_WIDGET_NAMES));

  if (!supportedTypes.has(type)) {
    throw new Error(`不支持的小组件类型：${type}`);
  }
  const name = typeof widgetData.name === 'string' && widgetData.name.trim()
    ? widgetData.name.trim()
    : DEFAULT_WIDGET_NAMES[type] || '桌面小组件';

  // 小组件基础信息写入 SQLite，布局和样式后续由 config.json 保存。
  db.run(
    `
      INSERT INTO widgets (name, type, visible, pinned, locked, created_at, updated_at)
      VALUES (?, ?, 1, 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [name, type]
  );

  const result = db.exec('SELECT last_insert_rowid() AS id;');
  let id = Number(result[0]?.values[0]?.[0]);

  if (!Number.isInteger(id) || id <= 0) {
    const fallbackResult = db.exec('SELECT MAX(id) AS id FROM widgets;');
    id = Number(fallbackResult[0]?.values[0]?.[0]);
  }

  persistDatabase();

  return getWidgetById(id);
}

function updateWidget(widgetId, widgetData = {}) {
  const id = normalizeWidgetId(widgetId);
  const currentWidget = getWidgetById(id);

  if (!currentWidget) {
    throw new Error('小组件不存在或已被删除。');
  }

  const name = typeof widgetData.name === 'string' && widgetData.name.trim()
    ? widgetData.name.trim()
    : currentWidget.name;
  const db = getDatabase();

  // 右键菜单中的“编辑组件”只更新组件基础信息，不影响布局和主题配置。
  db.run(
    'UPDATE widgets SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
    [name, id]
  );
  persistDatabase();

  return getWidgetById(id);
}

function deleteWidget(widgetId) {
  const id = normalizeWidgetId(widgetId);
  const db = getDatabase();
  const widget = getWidgetById(id);

  if (widget?.type === 'notes') {
    // sql.js 的旧数据库可能未启用外键级联；显式按实例清理可保证隔离且不影响其他便签窗口。
    db.run('DELETE FROM notes WHERE widget_instance_id = ?;', [id]);
  }

  // 删除小组件记录，不直接触碰配置文件中的布局数据，后续可按需清理。
  db.run('DELETE FROM widgets WHERE id = ?;', [id]);
  const deletedCount = db.getRowsModified();
  persistDatabase();

  return {
    id,
    deleted: deletedCount > 0
  };
}

function updateWidgetVisible(widgetId, visible) {
  const id = normalizeWidgetId(widgetId);
  const visibleValue = visible ? 1 : 0;
  const db = getDatabase();

  // 隐藏/显示只更新 widgets 表中的 visible 字段，窗口生命周期由主进程服务处理。
  db.run(
    'UPDATE widgets SET visible = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
    [visibleValue, id]
  );

  const updatedCount = db.getRowsModified();
  persistDatabase();

  return {
    id,
    visible: visibleValue,
    updated: updatedCount > 0,
    widget: getWidgetById(id)
  };
}

function removeDashboardWidgets() {
  const db = getDatabase();
  const statement = db.prepare('SELECT id FROM widgets WHERE type = ?;');
  const widgetIds = [];

  try {
    statement.bind(['dashboard']);
    while (statement.step()) {
      widgetIds.push(Number(statement.getAsObject().id));
    }
  } finally {
    statement.free();
  }

  if (!widgetIds.length) {
    return { deletedCount: 0, removedConfigCount: 0 };
  }

  db.run('DELETE FROM widgets WHERE type = ?;', ['dashboard']);
  const deletedCount = db.getRowsModified();
  persistDatabase();

  return {
    deletedCount,
    removedConfigCount: removeWidgetConfigs(widgetIds)
  };
}

module.exports = {
  DEFAULT_WIDGET_NAMES,
  createWidget,
  deleteWidget,
  getVisibleWidgetList,
  getWidgetById,
  getWidgetList,
  normalizeWidgetId,
  removeDashboardWidgets,
  updateWidget,
  updateWidgetVisible
};
