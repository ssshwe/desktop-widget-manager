const { safeIpcHandle } = require('./safeIpc');
const {
  createSchedule,
  deleteSchedule,
  getScheduleList,
  getTodayScheduleList,
  updateSchedule
} = require('../services/scheduleService');

function registerScheduleIpc() {
  safeIpcHandle('get-schedule-list', () => getScheduleList(), {
    message: '读取日程失败，请稍后重试。',
    fallbackValue: []
  });

  safeIpcHandle('get-today-schedule-list', () => getTodayScheduleList(), {
    message: '读取今日日程失败，请稍后重试。',
    fallbackValue: []
  });

  safeIpcHandle('create-schedule', (event, scheduleData) => {
    const schedule = createSchedule(scheduleData);

    return schedule;
  }, {
    message: '新增日程失败，请检查内容后重试。'
  });

  safeIpcHandle('update-schedule', (event, scheduleId, scheduleData) => {
    const schedule = updateSchedule(scheduleId, scheduleData);

    return schedule;
  }, {
    message: '更新日程失败，请检查内容后重试。'
  });

  safeIpcHandle('delete-schedule', (event, scheduleId) => {
    const result = deleteSchedule(scheduleId);

    return result;
  }, {
    message: '删除日程失败，请稍后重试。',
    fallback: (error, message, event, scheduleId) => ({
      id: Number(scheduleId),
      deleted: false,
      success: false,
      message
    })
  });
}

module.exports = {
  registerScheduleIpc
};
