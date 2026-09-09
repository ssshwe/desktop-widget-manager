const { Notification } = require('electron');
const {
  getDueSchedules,
  markScheduleReminded
} = require('./scheduleService');

const REMINDER_CHECK_INTERVAL_MS = 30 * 1000;

let reminderTimer = null;

function formatScheduleTime(schedule) {
  const start = schedule.startTime || '未设置开始时间';
  const end = schedule.endTime ? ` - ${schedule.endTime}` : '';

  return `${start}${end}`;
}

function showScheduleNotification(schedule, options = {}) {
  const missed = Boolean(options.missed);
  const titlePrefix = missed ? '错过提醒' : '日程提醒';
  const bodyParts = [
    schedule.content,
    `时间：${formatScheduleTime(schedule)}`
  ].filter(Boolean);

  if (!Notification.isSupported()) {
    console.warn(`[schedule-reminder] 当前环境不支持系统通知：${schedule.title}`);
    return;
  }

  // 桌面通知必须在主进程创建，渲染进程只负责维护日程数据。
  const notification = new Notification({
    title: `${titlePrefix}：${schedule.title}`,
    body: bodyParts.join('\n'),
    silent: false
  });

  notification.show();
}

function checkScheduleReminders(options = {}) {
  try {
    const dueSchedules = getDueSchedules();

    dueSchedules.forEach((schedule) => {
      try {
        showScheduleNotification(schedule, options);
        markScheduleReminded(schedule.id);
      } catch (error) {
        console.error(`[schedule-reminder] 处理提醒失败：id=${schedule.id}`, error);
      }
    });

    if (dueSchedules.length > 0) {
      console.log(`[schedule-reminder] 已处理 ${dueSchedules.length} 条${options.missed ? '错过' : '到期'}提醒。`);
    }

    return dueSchedules;
  } catch (error) {
    console.error('[schedule-reminder] 日程提醒检查失败：', error);
    return [];
  }
}

function startScheduleReminderChecker() {
  stopScheduleReminderChecker();

  // 应用启动后先检查关闭期间错过的提醒，再进入定时轮询。
  try {
    checkScheduleReminders({
      missed: true
    });
  } catch (error) {
    console.error('[schedule-reminder] 启动时检查错过提醒失败：', error);
  }

  reminderTimer = setInterval(() => {
    try {
      checkScheduleReminders({
        missed: false
      });
    } catch (error) {
      console.error('[schedule-reminder] 定时检查提醒失败：', error);
    }
  }, REMINDER_CHECK_INTERVAL_MS);

  if (typeof reminderTimer.unref === 'function') {
    reminderTimer.unref();
  }
}

function stopScheduleReminderChecker() {
  if (!reminderTimer) {
    return;
  }

  clearInterval(reminderTimer);
  reminderTimer = null;
}

module.exports = {
  checkScheduleReminders,
  startScheduleReminderChecker,
  stopScheduleReminderChecker
};
