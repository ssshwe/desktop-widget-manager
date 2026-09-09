(function registerTodoWidget() {
  const PRIORITY_LABELS = {
    low: '低优先级',
    medium: '中优先级',
    high: '高优先级'
  };
  const STATUS_FILTERS = new Set(['all', 'active', 'completed']);
  const DATE_FILTERS = new Set(['all', 'today', 'week', 'month']);
  let knownTodoIds = new Set();
  let hasRenderedTodos = false;
  let pendingCompletionFeedback = null;
  let allTodos = [];
  let activeStatusFilter = 'all';
  let activeDateFilter = 'all';

  const DwmUi = window.DwmUi;
  const escapeHtml = DwmUi.escapeHtml;

  function animateNewTodoItems(listElement) {
    const items = listElement.querySelectorAll('[data-motion-enter="true"]');

    if (!items.length) return;
    DwmUi.runMotion(
      items,
      {
        opacity: [0, 1],
        y: [14, 0],
        scale: [0.96, 1]
      },
      {
        type: 'spring',
        visualDuration: 0.3,
        bounce: 0.18,
        delay: DwmUi.getMotionStagger(0.045)
      }
    );
  }

  function animateTodoRemoval(item) {
    return DwmUi.hideMotionPanel(item, {
      x: 28,
      y: 0,
      scale: 0.98,
      duration: 0.18
    });
  }

  function startOfDay(value = new Date()) {
    const date = new Date(value);

    date.setHours(0, 0, 0, 0);
    return date;
  }

  function isDueToday(dueTime) {
    if (!dueTime) {
      return false;
    }

    const dueDate = new Date(dueTime);

    if (Number.isNaN(dueDate.getTime())) {
      return false;
    }

    return dueDate >= startOfDay() && dueDate < new Date(startOfDay().getTime() + 86400000);
  }

  function matchesDateFilter(todo) {
    if (activeDateFilter === 'all') {
      return true;
    }

    if (!todo.dueTime) {
      return false;
    }

    const dueDate = new Date(todo.dueTime);

    if (Number.isNaN(dueDate.getTime())) {
      return false;
    }

    const today = startOfDay();

    if (activeDateFilter === 'today') {
      return dueDate >= today && dueDate < new Date(today.getTime() + 86400000);
    }

    if (activeDateFilter === 'week') {
      const dayIndex = (today.getDay() + 6) % 7;
      const weekStart = new Date(today.getTime() - (dayIndex * 86400000));
      const weekEnd = new Date(weekStart.getTime() + (7 * 86400000));

      return dueDate >= weekStart && dueDate < weekEnd;
    }

    const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
    const monthEnd = new Date(today.getFullYear(), today.getMonth() + 1, 1);

    return dueDate >= monthStart && dueDate < monthEnd;
  }

  function getFilteredTodos() {
    return allTodos.filter((todo) => {
      const matchesStatus = activeStatusFilter === 'all'
        || (activeStatusFilter === 'active' && !todo.completed)
        || (activeStatusFilter === 'completed' && todo.completed);

      return matchesStatus && matchesDateFilter(todo);
    });
  }

  function formatDueTime(dueTime) {
    if (!dueTime) {
      return '—';
    }

    const date = new Date(dueTime);

    if (Number.isNaN(date.getTime())) {
      return dueTime;
    }

    if (isDueToday(dueTime)) {
      return date.toLocaleTimeString('zh-CN', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false
      });
    }

    return date.toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });
  }

  function formatToday() {
    const now = new Date();

    return {
      date: now.toLocaleDateString('zh-CN', {
        month: 'long',
        day: 'numeric'
      }),
      weekday: now.toLocaleDateString('zh-CN', {
        weekday: 'long'
      })
    };
  }

  function getFormData() {
    const title = document.querySelector('#todo-title').value.trim();
    const content = document.querySelector('#todo-content').value.trim();
    const priority = document.querySelector('#todo-priority').value;
    const dueTime = document.querySelector('#todo-due-time').value;

    return {
      title,
      content,
      priority,
      dueTime
    };
  }

  function setFormData(todo) {
    document.querySelector('#todo-title').value = todo?.title || '';
    document.querySelector('#todo-content').value = todo?.content || '';
    document.querySelector('#todo-priority').value = todo?.priority || 'medium';
    document.querySelector('#todo-due-time').value = todo?.dueTime || '';
    document.querySelector('#todo-edit-id').value = todo?.id || '';
    document.querySelector('#todo-submit-btn').textContent = todo ? '保存修改' : '新增待办';
    document.querySelector('#todo-cancel-edit-btn').hidden = !todo;
    document.querySelector('#todo-title').focus();
  }

  function renderSummary() {
    const completedCount = allTodos.filter((todo) => todo.completed).length;
    const totalCount = allTodos.length;
    const percentage = totalCount ? Math.round((completedCount / totalCount) * 100) : 0;

    document.querySelector('#todo-progress-copy').textContent = `${completedCount}/${totalCount} 已完成`;
    document.querySelector('#todo-progress-value').style.width = `${percentage}%`;
    document.querySelector('#todo-progress-track').setAttribute('aria-valuenow', String(percentage));
  }

  function syncFilterButtons() {
    document.querySelectorAll('[data-todo-status-filter]').forEach((button) => {
      const isActive = button.dataset.todoStatusFilter === activeStatusFilter;

      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
    document.querySelectorAll('[data-todo-date-filter]').forEach((button) => {
      const isActive = button.dataset.todoDateFilter === activeDateFilter;

      button.classList.toggle('is-active', isActive);
      button.setAttribute('aria-pressed', String(isActive));
    });
  }

  function renderTodoList() {
    const listElement = document.querySelector('#todo-list');
    const todos = getFilteredTodos();
    const completionFeedback = pendingCompletionFeedback;

    renderSummary();
    syncFilterButtons();

    if (!todos.length) {
      const isCompletelyEmpty = allTodos.length === 0;

      listElement.innerHTML = `
        <div class="todo-empty">
          <span class="todo-empty-icon" aria-hidden="true">
            <img src="./assets/ui-icons/phosphor-check-bold.svg" alt="" />
          </span>
          <strong>${isCompletelyEmpty ? '暂无待办' : '没有符合条件的待办'}</strong>
          <span>${isCompletelyEmpty ? '添加一项任务开始今天的计划' : '换一个筛选条件看看。'}</span>
        </div>
      `;
      knownTodoIds = new Set();
      hasRenderedTodos = true;
      pendingCompletionFeedback = null;
      return;
    }

    listElement.innerHTML = todos.map((todo, index) => {
      const todoId = Number(todo.id);
      const shouldEnter = !hasRenderedTodos || !knownTodoIds.has(todoId);
      const shouldConfirm = completionFeedback?.id === todoId;

      return `
        <article class="todo-item ${shouldConfirm ? 'video-feedback-complete' : ''} ${todo.completed ? 'is-completed' : ''}" data-motion-enter="${shouldEnter}" style="--stagger-index: ${index + 1}">
          <label class="todo-check" aria-label="${todo.completed ? '恢复待办' : '完成待办'}">
            <input type="checkbox" data-toggle-todo-id="${todo.id}" ${todo.completed ? 'checked' : ''} />
          </label>
          <div class="todo-main">
            <strong title="${escapeHtml(todo.title)}">${escapeHtml(todo.title)}</strong>
            ${todo.content ? `<span class="todo-content-preview" title="${escapeHtml(todo.content)}">${escapeHtml(todo.content)}</span>` : ''}
          </div>
          <div class="todo-meta">
            <span class="priority-pill priority-${escapeHtml(todo.priority)}">${PRIORITY_LABELS[todo.priority] || '中优先级'}</span>
            ${todo.dueTime ? `<time class="todo-due">${escapeHtml(formatDueTime(todo.dueTime))}</time>` : ''}
            <div class="todo-actions">
              <button type="button" data-edit-todo-id="${todo.id}" aria-label="编辑待办">
                <img src="./assets/ui-icons/phosphor-pencil-simple.svg" alt="" />
              </button>
              <button class="todo-delete-button" type="button" data-delete-todo-id="${todo.id}" aria-label="删除待办">
                <img src="./assets/ui-icons/phosphor-trash.svg" alt="" />
              </button>
            </div>
          </div>
        </article>
      `;
    }).join('');

    knownTodoIds = new Set(todos.map((todo) => Number(todo.id)));
    hasRenderedTodos = true;
    pendingCompletionFeedback = null;
    animateNewTodoItems(listElement);

    if (completionFeedback) {
      const feedbackItem = listElement
        .querySelector(`[data-toggle-todo-id="${completionFeedback.id}"]`)
        ?.closest('.todo-item');

      window.setTimeout(() => feedbackItem?.classList.remove('video-feedback-complete'), 620);
    }
  }

  async function refreshTodos() {
    allTodos = await window.api.getTodoList();
    renderTodoList();
    return allTodos;
  }

  async function handleSubmit(event) {
    event.preventDefault();

    const editId = document.querySelector('#todo-edit-id').value;
    const todoData = getFormData();

    if (!todoData.title) {
      document.querySelector('#todo-message').textContent = '请先输入待办标题。';
      return;
    }

    if (editId) {
      await window.api.updateTodo(Number(editId), todoData);
      document.querySelector('#todo-message').textContent = '待办已更新。';
    } else {
      await window.api.createTodo(todoData);
      document.querySelector('#todo-message').textContent = '待办已新增。';
    }

    setFormData(null);
    document.querySelector('#todo-title').blur();
    await refreshTodos();
  }

  async function handleListClick(event) {
    const deleteButton = event.target.closest('[data-delete-todo-id]');
    const editButton = event.target.closest('[data-edit-todo-id]');

    if (deleteButton) {
      const confirmed = window.confirm('确认删除这条待办吗？');

      if (!confirmed) {
        return;
      }

      const item = deleteButton.closest('.todo-item');

      await window.api.deleteTodo(Number(deleteButton.dataset.deleteTodoId));
      document.querySelector('#todo-message').textContent = '待办已删除。';
      animateTodoRemoval(item);
      await refreshTodos();
      return;
    }

    if (editButton) {
      const todoId = Number(editButton.dataset.editTodoId);
      const todo = allTodos.find((item) => item.id === todoId);

      setFormData(todo);
    }
  }

  async function handleListChange(event) {
    const checkbox = event.target.closest('[data-toggle-todo-id]');

    if (!checkbox) {
      return;
    }

    const todoId = Number(checkbox.dataset.toggleTodoId);

    await window.api.updateTodoCompleted(todoId, checkbox.checked);
    pendingCompletionFeedback = {
      id: todoId
    };
    await refreshTodos();
  }

  function handleFilterClick(event) {
    const statusButton = event.target.closest('[data-todo-status-filter]');
    const dateButton = event.target.closest('[data-todo-date-filter]');

    if (statusButton && STATUS_FILTERS.has(statusButton.dataset.todoStatusFilter)) {
      activeStatusFilter = statusButton.dataset.todoStatusFilter;
    }

    if (dateButton && DATE_FILTERS.has(dateButton.dataset.todoDateFilter)) {
      activeDateFilter = dateButton.dataset.todoDateFilter;
    }

    renderTodoList();
  }

  window.TodoWidget = {
    label: '今日待办',
    render() {
      const today = formatToday();

      return `
        <section class="todo-widget video-scene" aria-label="待办事项小组件">
          <section class="todo-summary" aria-label="今日进度">
            <div class="todo-date-copy">
              <strong>${escapeHtml(today.date)}</strong>
              <span>${escapeHtml(today.weekday)}</span>
            </div>
            <span id="todo-progress-copy" class="todo-progress-copy">0/0 已完成</span>
            <div id="todo-progress-track" class="todo-progress-track" role="progressbar" aria-label="待办完成进度" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">
              <span id="todo-progress-value"></span>
            </div>
          </section>

          <form id="todo-form" class="todo-form">
            <input id="todo-edit-id" type="hidden" />
            <div class="todo-add-row">
              <input id="todo-title" type="text" maxlength="80" placeholder="输入新的待办事项…" autocomplete="off" />
              <button id="todo-submit-btn" type="submit">新增待办</button>
              <button id="todo-cancel-edit-btn" type="button" hidden>取消</button>
            </div>
            <div class="todo-form-row">
              <input id="todo-content" type="text" maxlength="200" placeholder="备注（可选）" />
              <select id="todo-priority" aria-label="优先级">
                <option value="low">低优先级</option>
                <option value="medium" selected>中优先级</option>
                <option value="high">高优先级</option>
              </select>
              <input id="todo-due-time" type="datetime-local" aria-label="截止时间" />
            </div>
            <p id="todo-message" class="todo-message" aria-live="polite"></p>
          </form>

          <nav id="todo-filters" class="todo-filters" aria-label="筛选待办">
            <div class="todo-filter-row">
              <button class="is-active" type="button" data-todo-status-filter="all" aria-pressed="true">全部</button>
              <button type="button" data-todo-status-filter="active" aria-pressed="false">进行中</button>
              <button type="button" data-todo-status-filter="completed" aria-pressed="false">已完成</button>
            </div>
            <div class="todo-filter-row todo-filter-row-date">
              <button class="is-active" type="button" data-todo-date-filter="all" aria-pressed="true">全部日期</button>
              <button type="button" data-todo-date-filter="today" aria-pressed="false">今天</button>
              <button type="button" data-todo-date-filter="week" aria-pressed="false">本周</button>
              <button type="button" data-todo-date-filter="month" aria-pressed="false">本月</button>
            </div>
          </nav>

          <div id="todo-list" class="todo-list" aria-live="polite"></div>
        </section>
      `;
    },
    async mount() {
      document.querySelector('#todo-form').addEventListener('submit', handleSubmit);
      document.querySelector('#todo-list').addEventListener('click', handleListClick);
      document.querySelector('#todo-list').addEventListener('change', handleListChange);
      document.querySelector('#todo-filters').addEventListener('click', handleFilterClick);
      document.querySelector('#todo-cancel-edit-btn').addEventListener('click', () => {
        setFormData(null);
        document.querySelector('#todo-title').blur();
        document.querySelector('#todo-message').textContent = '已取消编辑。';
      });

      await refreshTodos();
    }
  };
}());
