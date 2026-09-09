const { getDatabase, persistDatabase } = require('../db/database');

function normalizeScheduleId(scheduleId) {
  const id = Number(scheduleId);

  if (!Number.isInteger(id) || id <= 0) {
    throw new Error('日程 ID 必须是正整数。');
  }

  return id;
}

function padTimePart(value) {
  return String(value).padStart(2, '0');
}

function toLocalDateString(date = new Date()) {
  return [
    date.getFullYear(),
    padTimePart(date.getMonth() + 1),
    padTimePart(date.getDate())
  ].join('-');
}

function toLocalDateTimeString(date = new Date()) {
  return `${toLocalDateString(date)}T${padTimePart(date.getHours())}:${padTimePart(date.getMinutes())}`;
}

function parseDateTime(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeDateTime(value, fieldName, required = false) {
  const dateTime = typeof value === 'string' ? value.trim() : '';

  if (!dateTime) {
    if (required) {
      throw new Error(`${fieldName}不能为空。`);
    }

    return null;
  }

  if (!parseDateTime(dateTime)) {
    throw new Error(`${fieldName}格式不正确。`);
  }

  return dateTime;
}

function normalizeScheduleInput(scheduleData = {}) {
  const title = typeof scheduleData.title === 'string' ? scheduleData.title.trim() : '';

  if (!title) {
    throw new Error('日程标题不能为空。');
  }

  const startTime = normalizeDateTime(scheduleData.startTime, '开始时间', true);
  const endTime = normalizeDateTime(scheduleData.endTime, '结束时间');
  const remindTime = normalizeDateTime(scheduleData.remindTime, '提醒时间');
  const startDate = parseDateTime(startTime);
  const endDate = parseDateTime(endTime);

  if (endDate && endDate.getTime() < startDate.getTime()) {
    throw new Error('结束时间不能早于开始时间。');
  }

  return {
    title,
    content: typeof scheduleData.content === 'string' ? scheduleData.content.trim() : '',
    start_time: startTime,
    end_time: endTime,
    remind_time: remindTime
  };
}

function mapScheduleRow(row) {
  return {
    id: row.id,
    title: row.title,
    content: row.content || '',
    startTime: row.start_time,
    endTime: row.end_time,
    remindTime: row.remind_time,
    reminded: Number(row.reminded) === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function readSchedules(statement) {
  const schedules = [];

  while (statement.step()) {
    schedules.push(mapScheduleRow(statement.getAsObject()));
  }

  statement.free();

  return schedules;
}

function getScheduleList() {
  const db = getDatabase();
  const statement = db.prepare(`
    SELECT
      id,
      title,
      content,
      start_time,
      end_time,
      remind_time,
      reminded,
      created_at,
      updated_at
    FROM schedules
    ORDER BY start_time ASC, id DESC
  `);

  return readSchedules(statement);
}

function getTodayScheduleList(date = new Date()) {
  const db = getDatabase();
  const day = toLocalDateString(date);
  const dayStart = `${day}T00:00`;
  const dayEnd = `${day}T23:59`;
  const statement = db.prepare(`
    SELECT
      id,
      title,
      content,
      start_time,
      end_time,
      remind_time,
      reminded,
      created_at,
      updated_at
    FROM schedules
    WHERE
      substr(start_time, 1, 10) = ?
      OR (
        end_time IS NOT NULL
        AND end_time != ''
        AND start_time <= ?
        AND end_time >= ?
      )
    ORDER BY start_time ASC, id ASC
  `);

  statement.bind([day, dayEnd, dayStart]);

  return readSchedules(statement);
}

function getScheduleById(scheduleId) {
  const db = getDatabase();
  const id = normalizeScheduleId(scheduleId);
  const statement = db.prepare(`
    SELECT
      id,
      title,
      content,
      start_time,
      end_time,
      remind_time,
      reminded,
      created_at,
      updated_at
    FROM schedules
    WHERE id = ?
  `);
  let schedule = null;

  statement.bind([id]);

  if (statement.step()) {
    schedule = mapScheduleRow(statement.getAsObject());
  }

  statement.free();

  return schedule;
}

function createSchedule(scheduleData) {
  const db = getDatabase();
  const schedule = normalizeScheduleInput(scheduleData);

  // 日程数据统一写入 SQLite，渲染进程只能通过 IPC 调用这里的服务。
  db.run(
    `
      INSERT INTO schedules (
        title,
        content,
        start_time,
        end_time,
        remind_time,
        reminded,
        created_at,
        updated_at
      )
      VALUES (?, ?, ?, ?, ?, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
    `,
    [
      schedule.title,
      schedule.content,
      schedule.start_time,
      schedule.end_time,
      schedule.remind_time
    ]
  );

  const result = db.exec('SELECT last_insert_rowid() AS id;');
  let id = Number(result[0]?.values[0]?.[0]);

  if (!Number.isInteger(id) || id <= 0) {
    const fallbackResult = db.exec('SELECT MAX(id) AS id FROM schedules;');
    id = Number(fallbackResult[0]?.values[0]?.[0]);
  }

  persistDatabase();

  return getScheduleById(id);
}

function updateSchedule(scheduleId, scheduleData) {
  const db = getDatabase();
  const id = normalizeScheduleId(scheduleId);
  const schedule = normalizeScheduleInput(scheduleData);

  // 编辑日程后重置 reminded，避免用户调整提醒时间后无法再次提醒。
  db.run(
    `
      UPDATE schedules
      SET
        title = ?,
        content = ?,
        start_time = ?,
        end_time = ?,
        remind_time = ?,
        reminded = 0,
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `,
    [
      schedule.title,
      schedule.content,
      schedule.start_time,
      schedule.end_time,
      schedule.remind_time,
      id
    ]
  );
  persistDatabase();

  return getScheduleById(id);
}

function deleteSchedule(scheduleId) {
  const db = getDatabase();
  const id = normalizeScheduleId(scheduleId);

  db.run('DELETE FROM schedules WHERE id = ?;', [id]);
  const deletedCount = db.getRowsModified();
  persistDatabase();

  return {
    id,
    deleted: deletedCount > 0
  };
}

function getDueSchedules(now = new Date()) {
  const db = getDatabase();
  const nowText = toLocalDateTimeString(now);
  const statement = db.prepare(`
    SELECT
      id,
      title,
      content,
      start_time,
      end_time,
      remind_time,
      reminded,
      created_at,
      updated_at
    FROM schedules
    WHERE
      reminded = 0
      AND remind_time IS NOT NULL
      AND remind_time != ''
      AND remind_time <= ?
    ORDER BY remind_time ASC, id ASC
  `);

  statement.bind([nowText]);

  return readSchedules(statement);
}

function markScheduleReminded(scheduleId) {
  const db = getDatabase();
  const id = normalizeScheduleId(scheduleId);

  // 提醒弹出后立即标记，防止定时轮询重复提醒同一条日程。
  db.run('UPDATE schedules SET reminded = 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?;', [id]);
  persistDatabase();

  return getScheduleById(id);
}

module.exports = {
  createSchedule,
  deleteSchedule,
  getDueSchedules,
  getScheduleById,
  getScheduleList,
  getTodayScheduleList,
  markScheduleReminded,
  toLocalDateTimeString,
  updateSchedule
};
