(function registerScheduleWidget() {
  let refreshTimer = null;
  let knownScheduleIds = new Set();
  let reminderStateById = new Map();
  let hasRenderedSchedules = false;

  const escapeHtml = window.DwmUi.escapeHtml;

  function parseDateTime(value) {
    if (!value) {
      return null;
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatTime(value) {
    const date = parseDateTime(value);

    if (!date) {
      return '未设置';
    }

    return date.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function formatTimeRange(schedule) {
    const start = formatTime(schedule.startTime);
    const end = schedule.endTime ? formatTime(schedule.endTime) : '';

    return end ? `${start} - ${end}` : start;
  }

  function getFormData() {
    const title = document.querySelector('#schedule-title').value.trim();
    const content = document.querySelector('#schedule-content').value.trim();
    const startTime = document.querySelector('#schedule-start-time').value;
    const endTime = document.querySelector('#schedule-end-time').value;
    const remindTime = document.querySelector('#schedule-remind-time').value;

    return {
      title,
      content,
      startTime,
      endTime,
      remindTime
    };
  }

  function setFormData(schedule) {
    document.querySelector('#schedule-title').value = schedule?.title || '';
    document.querySelector('#schedule-content').value = schedule?.content || '';
    document.querySelector('#schedule-start-time').value = schedule?.startTime || '';
    document.querySelector('#schedule-end-time').value = schedule?.endTime || '';
    document.querySelector('#schedule-remind-time').value = schedule?.remindTime || '';
    document.querySelector('#schedule-edit-id').value = schedule?.id || '';
    document.querySelector('#schedule-submit-btn').textContent = schedule ? '保存修改' : '新增日程';
    document.querySelector('#schedule-cancel-edit-btn').hidden = !schedule;
  }

  function getNextSchedule(schedules) {
    const now = new Date();

    return schedules.find((schedule) => {
      const start = parseDateTime(schedule.startTime);

      return start && start >= now;
    }) || schedules.find((schedule) => !schedule.reminded) || schedules[0];
  }

  function renderScheduleList(schedules) {
    const listElement = document.querySelector('#schedule-list');
    const countElement = document.querySelector('#schedule-count');
    const nextSchedule = getNextSchedule(schedules);
    const pendingReminderCount = schedules.filter((schedule) => schedule.remindTime && !schedule.reminded).length;

    countElement.textContent = String(schedules.length);
    document.querySelector('#schedule-route-status').textContent = pendingReminderCount
      ? `${pendingReminderCount} 个待提醒节点`
      : '路线状态平稳';
    document.querySelector('#schedule-next-title').textContent = nextSchedule?.title || '今日暂无日程';
    document.querySelector('#schedule-next-time').textContent = nextSchedule
      ? formatTimeRange(nextSchedule)
      : '添加一个提醒，把重要安排放进时间线。';

    if (!schedules.length) {
      listElement.innerHTML = `
        <div class="schedule-empty video-floating-card video-enter-stagger">
          <strong>今日暂无日程</strong>
          <span>添加一个提醒，把重要安排稳稳放进时间里。</span>
        </div>
      `;
      knownScheduleIds = new Set();
      reminderStateById = new Map();
      hasRenderedSchedules = true;
      return;
    }

    listElement.innerHTML = schedules.map((schedule, index) => {
      const scheduleId = Number(schedule.id);
      const hasReminder = Boolean(schedule.remindTime);
      const reminderLabel = schedule.reminded ? '已提醒' : '待提醒';
      const reminderClass = schedule.reminded ? 'is-reminded' : 'is-pending';
      const shouldEnter = !hasRenderedSchedules || !knownScheduleIds.has(scheduleId);
      const previousReminderState = reminderStateById.get(scheduleId);
      const reminderChanged = hasRenderedSchedules
        && previousReminderState !== undefined
        && previousReminderState !== Boolean(schedule.reminded);

      return `
        <article class="schedule-item video-list-card ${shouldEnter ? 'video-enter-stagger' : ''} ${schedule.reminded ? 'is-reminded' : ''}" style="--stagger-index: ${index + 1}">
          <div class="schedule-time-chip">
            <span class="schedule-node-dot"></span>
            <strong>${escapeHtml(formatTime(schedule.startTime))}</strong>
          </div>
          <div class="schedule-main">
            <div class="schedule-title-row">
              <strong>${escapeHtml(schedule.title)}</strong>
              ${hasReminder ? `<span class="schedule-remind-pill ${reminderClass} ${reminderChanged ? 'video-feedback-reminder' : ''}">${reminderLabel}</span>` : ''}
            </div>
            ${schedule.content ? `<p>${escapeHtml(schedule.content)}</p>` : ''}
            <span class="schedule-meta">时间：${escapeHtml(formatTimeRange(schedule))}</span>
            ${hasReminder ? `<span class="schedule-meta">提醒：${escapeHtml(formatTime(schedule.remindTime))}</span>` : ''}
          </div>
          <div class="schedule-actions">
            <button type="button" data-edit-schedule-id="${schedule.id}" aria-label="编辑日程">编辑</button>
            <button type="button" data-delete-schedule-id="${schedule.id}" aria-label="删除日程">删除</button>
          </div>
        </article>
      `;
    }).join('');

    knownScheduleIds = new Set(schedules.map((schedule) => Number(schedule.id)));
    reminderStateById = new Map(schedules.map((schedule) => [
      Number(schedule.id),
      Boolean(schedule.reminded)
    ]));
    hasRenderedSchedules = true;
  }

  async function refreshSchedules() {
    const schedules = await window.api.getTodayScheduleList();

    renderScheduleList(schedules);
    return schedules;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const editId = document.querySelector('#schedule-edit-id').value;
    const scheduleData = getFormData();
    const messageElement = document.querySelector('#schedule-message');

    if (!scheduleData.title) {
      messageElement.textContent = '请先输入日程标题。';
      return;
    }

    if (!scheduleData.startTime) {
      messageElement.textContent = '请设置开始时间。';
      return;
    }

    // 所有日程写入都通过 IPC 交给主进程，渲染进程不直接操作 SQLite。
    if (editId) {
      const result = await window.api.updateSchedule(Number(editId), scheduleData);

      if (result?.success === false) {
        messageElement.textContent = result.message || '日程更新失败。';
        return;
      }

      messageElement.textContent = '日程已更新。';
    } else {
      const result = await window.api.createSchedule(scheduleData);

      if (result?.success === false) {
        messageElement.textContent = result.message || '日程新增失败。';
        return;
      }

      messageElement.textContent = '日程已新增。';
    }

    setFormData(null);
    await refreshSchedules();
  }

  async function handleListClick(event) {
    const deleteButton = event.target.closest('[data-delete-schedule-id]');
    const editButton = event.target.closest('[data-edit-schedule-id]');

    if (deleteButton) {
      const confirmed = window.confirm('确认删除这条日程吗？');

      if (!confirmed) {
        return;
      }

      const result = await window.api.deleteSchedule(Number(deleteButton.dataset.deleteScheduleId));

      if (result?.success === false) {
        document.querySelector('#schedule-message').textContent = result.message || '日程删除失败。';
        return;
      }

      document.querySelector('#schedule-message').textContent = '日程已删除。';
      await refreshSchedules();
      return;
    }

    if (editButton) {
      const scheduleId = Number(editButton.dataset.editScheduleId);
      const schedules = await window.api.getTodayScheduleList();
      const schedule = schedules.find((item) => item.id === scheduleId);

      setFormData(schedule);
    }
  }

  window.ScheduleWidget = {
    label: '日程',
    render(params) {
      return `
        <section class="schedule-widget video-scene" aria-label="日程提醒小组件">
          <div class="schedule-hero video-hero">
            <div class="schedule-route-visual" aria-hidden="true">
              <span class="schedule-route-line"></span>
              <span class="schedule-route-point is-start"></span>
              <span class="schedule-route-point is-mid"></span>
              <span class="schedule-route-point is-end"></span>
            </div>
            <div class="schedule-hero-main">
              <p class="widget-kicker">${escapeHtml(params.name)}</p>
              <span class="schedule-hero-label">今日路线</span>
              <strong id="schedule-count" class="schedule-count">0</strong>
              <span class="schedule-count-caption">条今日日程</span>
            </div>
            <div class="schedule-next-card video-floating-card video-enter-stagger" style="--stagger-index: 3">
              <small id="schedule-route-status">路线状态平稳</small>
              <strong id="schedule-next-title">今日暂无日程</strong>
              <span id="schedule-next-time">添加一个提醒，把重要安排放进时间线。</span>
            </div>
          </div>

          <form id="schedule-form" class="schedule-form video-action-dock">
            <input id="schedule-edit-id" type="hidden" />
            <input id="schedule-title" type="text" maxlength="80" placeholder="新增日程标题" />
            <textarea id="schedule-content" rows="1" maxlength="200" placeholder="补充内容，可选"></textarea>
            <div class="schedule-form-row">
              <label>
                <span>开始</span>
                <input id="schedule-start-time" type="datetime-local" />
              </label>
              <label>
                <span>结束</span>
                <input id="schedule-end-time" type="datetime-local" />
              </label>
            </div>
            <label class="schedule-remind-field">
              <span>提醒</span>
              <input id="schedule-remind-time" type="datetime-local" />
            </label>
            <div class="schedule-form-actions">
              <button id="schedule-submit-btn" type="submit">新增日程</button>
              <button id="schedule-cancel-edit-btn" type="button" hidden>取消编辑</button>
            </div>
          </form>

          <p id="schedule-message" class="schedule-message"></p>
          <div id="schedule-list" class="schedule-list" aria-live="polite"></div>
        </section>
      `;
    },
    async mount() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
      }

      document.querySelector('#schedule-form').addEventListener('submit', handleSubmit);
      document.querySelector('#schedule-list').addEventListener('click', handleListClick);
      document.querySelector('#schedule-cancel-edit-btn').addEventListener('click', () => {
        setFormData(null);
        document.querySelector('#schedule-message').textContent = '已取消编辑。';
      });

      await refreshSchedules();

      // 小组件打开期间定时刷新，方便主进程标记 reminded 后同步到列表。
      refreshTimer = setInterval(() => {
        if (!document.hidden) {
          refreshSchedules().catch(() => {});
        }
      }, 30 * 1000);
    },
    unmount() {
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    }
  };
}());
