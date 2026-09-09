const { getDatabase, persistDatabase } = require('../db/database');

const PRIORITY_VALUES = new Set(['low', 'medium', 'high']);

function normalizeTodoId(todoId) {
  const id = Number(todoId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('待办 ID 必须是正整数。');
  }

  return id;
}

function normalizePriority(priority) {
  return PRIORITY_VALUES.has(priority) ? priority : 'medium';
}

function normalizeTodoInput(todoData = {}) {
  const title = typeof todoData.title === 'string' ? todoData.title.trim() : '';

  if (!title) {
    throw new Error('待办标题不能为空。');
  }

  return {
    title,
    content: typeof todoData.content === 'string' ? todoData.content.trim() : '',
    priority: normalizePriority(todoData.priority),
    due_time: typeof todoData.dueTime === 'string' && todoData.dueTime ? todoData.dueTime : null
  };
}

function mapTodoRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content || '',
    priority: row.priority,
    dueTime: row.due_time,
    completed: Number(row.completed) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function getTodoList() {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT
      id,
      title,
      content,
      priority,
      due_time,
      completed,
      created_at,
      updated_at
    FROM todos
    ORDER BY
      completed ASC,
      CASE WHEN due_time IS NULL OR due_time = '' THEN 1 ELSE 0 END ASC,
      due_time ASC,
      created_at DESC
  `);
  const todos = [];

  while (statement.step()) {
    todos.push(mapTodoRow(statement.getAsObject()));
  }

  statement.free();

  return todos;
}

function getTodoById(todoId) {
  const db = getDatabase();
  const id = normalizeTodoId(todoId);
  const statement = db.prepare(`
    SELECT
      id,
      title,
      content,
      priority,
      due_time,
      completed,
      created_at,
      updated_at
    FROM todos
    WHERE id = ?
  `);
  let todo = null;

  statement.bind([id]);

  if (statement.step()) {
    todo = mapTodoRow(statement.getAsObject());
  }

  statement.free();

  return todo;
}

function createTodo(todoData) {
  const db = getDatabase();
  const todo = normalizeTodoInput(todoData);

  // 待办数据写入 SQLite，保证重启后仍然存在。
  db.run(
    `
      INSERT INTO todos (title, content, priority, due_time, completed, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [todo.title, todo.content, todo.priority, todo.due_time]
  );

  const result = db.exec('SELECT last_insert_rowid() AS id;');
  let id = Number(result[0]?.values[0]?.[0]);

  if (!Number.isInteger(id) || id <= 0) {
    // sql.js 在极少数情况下可能无法直接读到 last_insert_rowid，这里兜底取最新记录。
    const fallbackResult = db.exec('SELECT MAX(id) AS id FROM todos;');
    id = Number(fallbackResult[0]?.values[0]?.[0]);
  }

  persistDatabase();

  return getTodoById(id);
}

function updateTodo(todoId, todoData) {
  const db = getDatabase();
  const id = normalizeTodoId(todoId);
  const todo = normalizeTodoInput(todoData);

  db.run(
    `
      UPDATE todos
      SET title = ?, content = ?, priority = ?, due_time = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [todo.title, todo.content, todo.priority, todo.due_time, id]
  );
  persistDatabase();

  return getTodoById(id);
}

function deleteTodo(todoId) {
  const db = getDatabase();
  const id = normalizeTodoId(todoId);

  db.run('DELETE FROM todos WHERE id = ?;', [id]);
  const deletedCount = db.getRowsModified();
  persistDatabase();

  return {
    id,
    deleted: deletedCount > 0
  };
}

function updateTodoCompleted(todoId, completed) {
  const db = getDatabase();
  const id = normalizeTodoId(todoId);
  const completedValue = completed ? 1 : 0;

  // 完成/取消完成只更新 completed 字段，不影响待办正文。
  db.run(
    'UPDATE todos SET completed = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?;',
    [completedValue, id]
  );
  persistDatabase();

  return getTodoById(id);
}

module.exports = {
  createTodo,
  deleteTodo,
  getTodoList,
  updateTodo,
  updateTodoCompleted
};
