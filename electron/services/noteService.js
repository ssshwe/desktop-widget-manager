const { getDatabase, persistDatabase } = require('../db/database');

const DEFAULT_NOTE_CATEGORIES = Object.freeze(['学习', '工作', '生活', '临时', '重要']);
const MAX_NOTE_TITLE_LENGTH = 120;
const MAX_NOTE_CONTENT_LENGTH = 5000;
const MAX_NOTE_CATEGORY_LENGTH = 24;

function normalizePositiveInteger(value, fieldName) {
  const numberValue = Number(value);

  if (!Number.isInteger(numberValue) || numberValue <= 0) {
    throw new Error(`${fieldName}必须是正整数。`);
  }

  return numberValue;
}

function normalizeWidgetInstanceId(widgetInstanceId) {
  return normalizePositiveInteger(widgetInstanceId, '小组件实例 ID');
}

function normalizeNoteId(noteId) {
  return normalizePositiveInteger(noteId, '便签 ID');
}

function normalizeText(value, fieldName, maxLength, options = {}) {
  const text = typeof value === 'string' ? value : '';

  if (text.length > maxLength) {
    throw new Error(`${fieldName}不能超过 ${maxLength} 个字符。`);
  }

  return options.trim === false ? text : text.trim();
}

function deriveTitle(content) {
  const firstLine = String(content || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean) || '';

  return firstLine.slice(0, 40) || '新便签';
}

function normalizeCategory(value) {
  const category = normalizeText(value, '分类', MAX_NOTE_CATEGORY_LENGTH);

  return category || '临时';
}

function assertNotesWidget(db, widgetInstanceId) {
  const statement = db.prepare('SELECT id, type FROM widgets WHERE id = ?;');
  let widget = null;

  statement.bind([widgetInstanceId]);
  if (statement.step()) {
    widget = statement.getAsObject();
  }
  statement.free();

  if (!widget) {
    throw new Error('快速便签小组件实例不存在或已被删除。');
  }

  if (widget.type !== 'notes') {
    throw new Error('当前小组件不是快速便签类型。');
  }
}

function mapNoteRow(row) {
  return {
    id: Number(row.id),
    widgetInstanceId: Number(row.widget_instance_id),
    title: row.title || '',
    content: row.content || '',
    category: row.category || '临时',
    isPinned: Number(row.is_pinned) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readNotes(statement) {
  const notes = [];

  while (statement.step()) {
    notes.push(mapNoteRow(statement.getAsObject()));
  }
  statement.free();

  return notes;
}

function getNoteById(widgetInstanceId, noteId) {
  const db = getDatabase();
  const widgetId = normalizeWidgetInstanceId(widgetInstanceId);
  const id = normalizeNoteId(noteId);
  const statement = db.prepare(`
    SELECT id, widget_instance_id, title, content, category, is_pinned, created_at, updated_at
    FROM notes
    WHERE id = ? AND widget_instance_id = ?
  `);
  let note = null;

  statement.bind([id, widgetId]);
  if (statement.step()) {
    note = mapNoteRow(statement.getAsObject());
  }
  statement.free();

  return note;
}

function getNotes(widgetInstanceId) {
  const db = getDatabase();
  const widgetId = normalizeWidgetInstanceId(widgetInstanceId);
  const statement = db.prepare(`
    SELECT id, widget_instance_id, title, content, category, is_pinned, created_at, updated_at
    FROM notes
    WHERE widget_instance_id = ?
    ORDER BY is_pinned DESC, datetime(updated_at) DESC, id DESC
  `);

  statement.bind([widgetId]);
  return readNotes(statement);
}

function searchNotes(widgetInstanceId, query) {
  const db = getDatabase();
  const widgetId = normalizeWidgetInstanceId(widgetInstanceId);
  const searchText = normalizeText(query, '搜索内容', 200);

  if (!searchText) {
    return getNotes(widgetId);
  }

  const statement = db.prepare(`
    SELECT id, widget_instance_id, title, content, category, is_pinned, created_at, updated_at
    FROM notes
    WHERE widget_instance_id = ?
      AND (
        instr(lower(title), lower(?)) > 0
        OR instr(lower(content), lower(?)) > 0
        OR instr(lower(category), lower(?)) > 0
      )
    ORDER BY is_pinned DESC, datetime(updated_at) DESC, id DESC
  `);

  statement.bind([widgetId, searchText, searchText, searchText]);
  return readNotes(statement);
}

function createNote(widgetInstanceId, noteData = {}) {
  const db = getDatabase();
  const widgetId = normalizeWidgetInstanceId(widgetInstanceId);
  const content = normalizeText(noteData.content, '便签正文', MAX_NOTE_CONTENT_LENGTH);
  const requestedTitle = normalizeText(noteData.title, '便签标题', MAX_NOTE_TITLE_LENGTH);
  const title = requestedTitle || deriveTitle(content);
  const category = normalizeCategory(noteData.category);
  const isPinned = noteData.isPinned ? 1 : 0;

  assertNotesWidget(db, widgetId);

  if (!title.trim() && !content.trim()) {
    throw new Error('便签内容不能为空。');
  }

  db.run(
    `
      INSERT INTO notes (
        widget_instance_id,
        title,
        content,
        category,
        is_pinned,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [widgetId, title, content, category, isPinned]
  );

  const result = db.exec('SELECT last_insert_rowid() AS id;');
  let id = Number(result[0]?.values[0]?.[0]);

  if (!Number.isInteger(id) || id <= 0) {
    const fallback = db.prepare('SELECT MAX(id) AS id FROM notes WHERE widget_instance_id = ?;');

    try {
      fallback.bind([widgetId]);
      id = fallback.step() ? Number(fallback.getAsObject().id) : NaN;
    } finally {
      fallback.free();
    }
  }

  persistDatabase();
  return getNoteById(widgetId, id);
}

function updateNote(widgetInstanceId, noteId, noteData = {}) {
  const db = getDatabase();
  const widgetId = normalizeWidgetInstanceId(widgetInstanceId);
  const id = normalizeNoteId(noteId);
  const current = getNoteById(widgetId, id);

  if (!current) {
    throw new Error('便签不存在或已被删除。');
  }

  const title = noteData.title === undefined
    ? current.title
    : normalizeText(noteData.title, '便签标题', MAX_NOTE_TITLE_LENGTH);
  const content = noteData.content === undefined
    ? current.content
    : normalizeText(noteData.content, '便签正文', MAX_NOTE_CONTENT_LENGTH);
  const category = noteData.category === undefined
    ? current.category
    : normalizeCategory(noteData.category);
  const isPinned = noteData.isPinned === undefined
    ? current.isPinned
    : Boolean(noteData.isPinned);
  const normalizedTitle = title || deriveTitle(content);

  if (!normalizedTitle.trim() && !content.trim()) {
    throw new Error('便签标题和正文不能同时为空。');
  }

  db.run(
    `
      UPDATE notes
      SET title = ?, content = ?, category = ?, is_pinned = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND widget_instance_id = ?
    `,
    [normalizedTitle, content, category, isPinned ? 1 : 0, id, widgetId]
  );

  if (db.getRowsModified() === 0) {
    throw new Error('便签不存在或已被删除。');
  }

  persistDatabase();
  return getNoteById(widgetId, id);
}

function toggleNotePinned(widgetInstanceId, noteId, pinned) {
  return updateNote(widgetInstanceId, noteId, {
    isPinned: Boolean(pinned)
  });
}

function deleteNote(widgetInstanceId, noteId) {
  const db = getDatabase();
  const widgetId = normalizeWidgetInstanceId(widgetInstanceId);
  const id = normalizeNoteId(noteId);

  db.run('DELETE FROM notes WHERE id = ? AND widget_instance_id = ?;', [id, widgetId]);
  const deleted = db.getRowsModified() > 0;
  persistDatabase();

  return {
    id,
    widgetInstanceId: widgetId,
    deleted
  };
}

function getNoteCategories() {
  return [...DEFAULT_NOTE_CATEGORIES];
}

module.exports = {
  DEFAULT_NOTE_CATEGORIES,
  MAX_NOTE_CONTENT_LENGTH,
  MAX_NOTE_TITLE_LENGTH,
  createNote,
  deleteNote,
  getNoteById,
  getNoteCategories,
  getNotes,
  searchNotes,
  toggleNotePinned,
  updateNote
};
