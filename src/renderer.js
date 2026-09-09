const AVAILABLE_WIDGETS = [
  {
    type: 'clock',
    name: '时钟小组件',
    defaultName: '时钟小组件',
    summary: '时间 / 日期 / 星期'
  },
  {
    type: 'weather',
    name: '天气小组件',
    defaultName: '天气小组件',
    summary: '城市 / 温度 / 空气质量'
  },
  {
    type: 'todo',
    name: '待办事项小组件',
    defaultName: '待办事项',
    summary: '任务 / 优先级 / 完成状态'
  },
  {
    type: 'notes',
    name: '快速便签小组件',
    defaultName: '快速便签',
    summary: '记录 / 复制 / 桌面便签'
  },
  {
    type: 'schedule',
    name: '日程提醒小组件',
    defaultName: '日程提醒',
    summary: '日程 / 提醒 / 今日安排'
  },
  {
    type: 'floatingFolder',
    name: '快捷收纳区小组件',
    defaultName: '快捷收纳区',
    summary: '文件 / 文件夹 / 应用快捷入口'
  },
];

const WIDGET_VISUALS = {
  clock: {
    art: './assets/widget-visuals/clock-object.png',
    tagIcon: './assets/ui-icons/figma-icon-00.svg',
    rowIcon: './assets/ui-icons/figma-icon-14.svg',
    typeIcon: './assets/ui-icons/figma-icon-15.svg'
  },
  weather: {
    art: './assets/widget-visuals/weather-object-figma.png',
    tagIcon: './assets/ui-icons/figma-icon-02.svg',
    rowIcon: './assets/ui-icons/figma-icon-02.svg',
    typeIcon: './assets/ui-icons/figma-icon-02.svg'
  },
  todo: {
    art: './assets/widget-visuals/todo-object-figma.png',
    tagIcon: './assets/ui-icons/figma-icon-03.svg',
    rowIcon: './assets/ui-icons/figma-icon-03.svg',
    typeIcon: './assets/ui-icons/figma-icon-03.svg'
  },
  notes: {
    art: './assets/widget-visuals/notes-object-transparent.png',
    tagIcon: './assets/ui-icons/quick-notes-header.png',
    rowIcon: './assets/ui-icons/quick-notes-header.png',
    typeIcon: './assets/ui-icons/quick-notes-header.png'
  },
  schedule: {
    art: './assets/widget-visuals/schedule-object.png',
    tagIcon: './assets/ui-icons/figma-icon-06.svg',
    rowIcon: './assets/ui-icons/figma-icon-06.svg',
    typeIcon: './assets/ui-icons/figma-icon-06.svg'
  },
  floatingFolder: {
    art: './assets/widget-visuals/floating-folder-object.png',
    tagIcon: './assets/ui-icons/figma-icon-05.svg',
    rowIcon: './assets/ui-icons/figma-icon-05.svg',
    typeIcon: './assets/ui-icons/figma-icon-05.svg'
  }
};

const ACTION_ICONS = {
  delete: './assets/ui-icons/figma-icon-09.svg',
  visibility: './assets/ui-icons/figma-icon-10.svg',
  pinned: './assets/ui-icons/figma-icon-11.svg',
  locked: './assets/ui-icons/figma-icon-12.svg',
  settings: './assets/ui-icons/figma-icon-13.svg',
  add: './assets/ui-icons/figma-icon-01.svg'
};

const DwmUi = window.DwmUi;
const Motion = window.Motion;

const MOTION_ROW_LIMIT = 12;
const MOTION_DEFAULT_OPTIONS = {
  duration: 0.2,
  ease: 'easeOut'
};

let desktopOrganizePreviewToken = '';
let currentThemeConfig = null;
let themeDraftConfig = null;
let currentSystemConfig = null;

const escapeHtml = DwmUi.escapeHtml;
const clampNumber = DwmUi.clampNumber;
const normalizeThemeConfig = DwmUi.normalizeThemeConfig;

const applyThemeConfig = DwmUi.applyThemeConfig;

function shouldReduceMotion() {
  return typeof window.matchMedia === 'function'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function runMotion(elements, keyframes, options = {}) {
  if (!Motion?.animate || shouldReduceMotion()) {
    return null;
  }

  const targets = elements instanceof Element
    ? [elements]
    : Array.from(elements || []).filter((element) => element instanceof Element);

  if (!targets.length) {
    return null;
  }

  try {
    return Motion.animate(targets, keyframes, {
      ...MOTION_DEFAULT_OPTIONS,
      ...options
    });
  } catch (error) {
    console.warn('[renderer] Motion animation skipped:', error);
    return null;
  }
}

function getStaggerDelay(interval) {
  return Motion?.stagger ? Motion.stagger(interval) : 0;
}

function animateDesktopScanResults() {
  runMotion(
    document.querySelectorAll('.category-preview-card'),
    { opacity: [0, 1], y: [6, 0] },
    {
      duration: 0.18,
      delay: getStaggerDelay(0.035)
    }
  );

  runMotion(
    [...document.querySelectorAll('.desktop-file-row')].slice(0, MOTION_ROW_LIMIT),
    { opacity: [0, 1], y: [8, 0] },
    {
      duration: 0.2,
      delay: getStaggerDelay(0.025)
    }
  );
}

function animateOrganizePreview(mode) {
  const previewPanel = document.querySelector('#desktop-organize-preview');
  const previewRows = [...document.querySelectorAll('.organize-preview-row')].slice(0, MOTION_ROW_LIMIT);

  if (mode === 'preview') {
    runMotion(previewPanel, { opacity: [0, 1], y: [10, 0] }, { duration: 0.2 });
  }

  runMotion(
    previewRows,
    {
      opacity: [0, 1],
      y: [mode === 'result' ? 6 : 8, 0],
      scale: [mode === 'result' ? 0.99 : 1, 1]
    },
    {
      duration: mode === 'result' ? 0.18 : 0.2,
      delay: getStaggerDelay(0.025)
    }
  );
}

function animateViewPanel(viewPanel) {
  runMotion(viewPanel, { opacity: [0, 1], y: [8, 0] }, { duration: 0.18 });
}

function startPendingActionAnimation(button) {
  if (!Motion?.animate || shouldReduceMotion() || !button) {
    return () => {};
  }

  const animation = runMotion(button, { opacity: [1, 0.62, 1] }, {
    duration: 0.9,
    ease: 'easeInOut',
    repeat: Infinity
  });

  return () => {
    animation?.cancel?.();
    button.style.removeProperty('opacity');
  };
}

function updateThemeControlValues(config = {}) {
  const themeConfig = normalizeThemeConfig(config);
  const opacityInput = document.querySelector('#theme-opacity-input');
  const radiusInput = document.querySelector('#theme-radius-input');
  const fontSizeInput = document.querySelector('#theme-font-size-input');
  const shadowInput = document.querySelector('#theme-shadow-input');
  const opacityValue = document.querySelector('#theme-opacity-value');
  const radiusValue = document.querySelector('#theme-radius-value');
  const fontSizeValue = document.querySelector('#theme-font-size-value');

  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.classList.toggle('is-active', button.dataset.themeOption === themeConfig.theme);
  });

  if (opacityInput) {
    opacityInput.value = String(themeConfig.globalOpacity);
  }

  if (radiusInput) {
    radiusInput.value = String(themeConfig.borderRadius);
  }

  if (fontSizeInput) {
    fontSizeInput.value = String(themeConfig.fontSize);
  }

  if (shadowInput) {
    shadowInput.checked = themeConfig.shadow;
  }

  if (opacityValue) {
    opacityValue.textContent = `${Math.round(themeConfig.globalOpacity * 100)}%`;
  }

  if (radiusValue) {
    radiusValue.textContent = `${themeConfig.borderRadius}px`;
  }

  if (fontSizeValue) {
    fontSizeValue.textContent = `${themeConfig.fontSize}px`;
  }
}

function loadThemeConfig(config = {}) {
  currentThemeConfig = normalizeThemeConfig(config);
  themeDraftConfig = { ...currentThemeConfig };
  applyThemeConfig(themeDraftConfig);
  updateThemeControlValues(themeDraftConfig);
}

function updateThemeDraft(partialConfig = {}) {
  themeDraftConfig = normalizeThemeConfig({
    ...(themeDraftConfig || currentThemeConfig || {}),
    ...partialConfig
  });

  applyThemeConfig(themeDraftConfig);
  updateThemeControlValues(themeDraftConfig);
  showReservedMessage('主题预览未保存');
}

function normalizeSystemConfig(config = {}) {
  return {
    autoStart: config.autoStart === true
  };
}

function setSystemSettingsMessage(message, isError = false) {
  const messageElement = document.querySelector('#system-settings-message');

  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
  messageElement.classList.toggle('is-error', isError);
}

function updateSystemControlValues(config = {}) {
  const systemConfig = normalizeSystemConfig(config);
  const autoStartInput = document.querySelector('#auto-start-input');

  currentSystemConfig = systemConfig;

  if (autoStartInput) {
    autoStartInput.checked = systemConfig.autoStart;
  }

  setSystemSettingsMessage(systemConfig.autoStart
    ? '开机自启动已开启。'
    : '开机自启动已关闭。');
}

function getWidgetTypeLabel(type) {
  const widget = AVAILABLE_WIDGETS.find((item) => item.type === type);

  return widget ? widget.name : type;
}

function setApiStatus(isReady) {
  const statusElement = document.querySelector('#api-status');
  const statusDot = document.querySelector('.status-dot');

  if (!statusElement || !statusDot) {
    return;
  }

  statusElement.textContent = isReady ? '主进程已连接' : '主进程未连接';
  statusDot.classList.toggle('is-ready', isReady);
}

function renderAvailableWidgets() {
  const gridElement = document.querySelector('#available-widget-grid');

  if (!gridElement) {
    return;
  }

  gridElement.innerHTML = AVAILABLE_WIDGETS.map((widget) => `
    <article class="available-card ${escapeHtml(widget.type)}">
      <div class="available-card-copy">
        <span class="widget-type-chip">
          <img src="${WIDGET_VISUALS[widget.type].tagIcon}" alt="" />
          ${escapeHtml(widget.type)}
        </span>
        <h4>${escapeHtml(widget.name)}</h4>
        <p>${escapeHtml(widget.summary)}</p>
        <button class="add-widget-btn" type="button" data-add-widget-type="${escapeHtml(widget.type)}">
          <img src="${ACTION_ICONS.add}" alt="" />
          <span>添加</span>
        </button>
      </div>
      <div class="available-card-art" aria-hidden="true">
        <img src="${WIDGET_VISUALS[widget.type].art}" alt="" />
      </div>
    </article>
  `).join('');
}

function getWidgetLayoutConfig(widget, widgetConfigs) {
  const config = DwmUi.getWidgetConfig(widgetConfigs, widget.id);
  const windowMode = DwmUi.isWindowMode(config.windowMode)
    ? config.windowMode
    : (config.pinned === false ? 'normal' : 'desktop');

  return {
    opacity: Number(config.opacity) || 1,
    windowMode,
    pinned: windowMode === 'desktop',
    locked: config.locked !== undefined ? Boolean(config.locked) : Boolean(widget.locked)
  };
}

function captureAddedWidgetListState(listElement) {
  const activeElement = document.activeElement;
  const focusAttributes = [
    'data-delete-widget-id',
    'data-toggle-widget-id',
    'data-window-mode-widget-id',
    'data-toggle-locked-widget-id',
    'data-opacity-widget-id'
  ];
  const focusAttribute = focusAttributes.find((attribute) => activeElement?.hasAttribute(attribute));

  return {
    scrollTop: listElement.scrollTop,
    scrollLeft: listElement.scrollLeft,
    focusAttribute,
    focusValue: focusAttribute ? activeElement.getAttribute(focusAttribute) : ''
  };
}

function restoreAddedWidgetListState(listElement, state) {
  listElement.scrollTop = state.scrollTop;
  listElement.scrollLeft = state.scrollLeft;

  if (!state.focusAttribute || !state.focusValue) {
    return;
  }

  const escapedValue = window.CSS?.escape
    ? window.CSS.escape(state.focusValue)
    : state.focusValue.replaceAll('"', '\\"');
  const nextFocusedElement = listElement.querySelector(`[${state.focusAttribute}="${escapedValue}"]`);
  nextFocusedElement?.focus({ preventScroll: true });
}

function renderAddedWidgets(widgets, widgetConfigs = {}) {
  const listElement = document.querySelector('#added-widget-list');
  const countElement = document.querySelector('#widget-count');

  if (countElement) {
    countElement.textContent = `${widgets.length} 个`;
  }

  if (!listElement) {
    return;
  }

  const previousState = captureAddedWidgetListState(listElement);

  if (!widgets.length) {
    listElement.innerHTML = `
      <div class="empty-row">
        <strong>暂无已添加小组件</strong>
        <span>可从下方区域添加一个测试组件。</span>
      </div>
    `;
    return;
  }

  listElement.innerHTML = widgets.map((widget) => {
    const layoutConfig = getWidgetLayoutConfig(widget, widgetConfigs);
    const opacityPercent = Math.round(layoutConfig.opacity * 100);
    const visual = WIDGET_VISUALS[widget.type] || WIDGET_VISUALS.clock;

    return `
      <article class="widget-row" data-type="${escapeHtml(widget.type)}">
        <div class="widget-info">
          <span class="widget-row-icon">
            <img src="${visual.rowIcon}" alt="" />
          </span>
          <div class="widget-name-cell">
            <strong>${escapeHtml(widget.name)}</strong>
            <span>ID ${escapeHtml(widget.id)}</span>
          </div>
        </div>
        <span class="widget-type-cell">
          <img src="${visual.typeIcon}" alt="" />
          <span>${escapeHtml(getWidgetTypeLabel(widget.type))}</span>
        </span>
        <span class="widget-state-cell widget-state-stack">
          <span class="state-pill ${widget.visible ? 'is-visible' : 'is-hidden'}">
            ${widget.visible ? '显示中' : '已隐藏'}
          </span>
          <small>${layoutConfig.windowMode === 'desktop' ? '已固定' : '未固定'} · ${layoutConfig.locked ? '已锁定' : '未锁定'}</small>
        </span>
        <div class="row-actions">
          <button class="widget-action-btn is-danger" type="button" data-delete-widget-id="${escapeHtml(widget.id)}">
            <img src="${ACTION_ICONS.delete}" alt="" />
            <span>删除</span>
          </button>
          <button class="widget-action-btn ${widget.visible ? 'is-active' : ''}" type="button" data-toggle-widget-id="${escapeHtml(widget.id)}" data-next-visible="${widget.visible ? '0' : '1'}">
            <img src="${ACTION_ICONS.visibility}" alt="" />
            <span>${widget.visible ? '隐藏' : '显示'}</span>
          </button>
          <label class="window-mode-control" title="显示层级">
            <img src="${ACTION_ICONS.pinned}" alt="" />
            <select data-window-mode-widget-id="${escapeHtml(widget.id)}" aria-label="${escapeHtml(widget.name)}显示层级">
              <option value="desktop" ${layoutConfig.windowMode === 'desktop' ? 'selected' : ''}>固定桌面</option>
              <option value="normal" ${layoutConfig.windowMode === 'normal' ? 'selected' : ''}>普通窗口</option>
              <option value="alwaysOnTop" ${layoutConfig.windowMode === 'alwaysOnTop' ? 'selected' : ''}>始终置顶</option>
            </select>
          </label>
          <button class="widget-action-btn ${layoutConfig.locked ? 'is-active' : ''}" type="button" data-toggle-locked-widget-id="${escapeHtml(widget.id)}" data-next-locked="${layoutConfig.locked ? '0' : '1'}">
            <img src="${ACTION_ICONS.locked}" alt="" />
            <span>${layoutConfig.locked ? '解锁' : '锁定'}</span>
          </button>
          <button class="widget-action-btn is-neutral" type="button" data-reserved-action="settings" data-widget-id="${escapeHtml(widget.id)}">
            <img src="${ACTION_ICONS.settings}" alt="" />
            <span>设置</span>
          </button>
        </div>
        <label class="opacity-control">
          <span>透明度</span>
          <strong data-opacity-value>${opacityPercent}%</strong>
          <input
            type="range"
            min="0.3"
            max="1"
            step="0.05"
            value="${layoutConfig.opacity}"
            data-opacity-widget-id="${escapeHtml(widget.id)}"
            style="--range-progress: ${opacityPercent}%"
          />
        </label>
      </article>
    `;
  }).join('');

  restoreAddedWidgetListState(listElement, previousState);
}

function formatDesktopModifiedAt(value) {
  if (!value) {
    return '未知';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return date.toLocaleString('zh-CN', {
    hour12: false
  });
}

function setDesktopScanMessage(message, isError = false) {
  const messageElement = document.querySelector('#desktop-scan-message');

  if (!messageElement) {
    return;
  }

  messageElement.textContent = message;
  messageElement.classList.toggle('is-error', isError);
}

function getDesktopCategoryOrder(files = []) {
  const defaultOrder = ['学习', '工作', '娱乐', '工具', '其他'];
  const fileCategories = files.map((file) => file.categoryName).filter(Boolean);

  return [...new Set([...defaultOrder, ...fileCategories])];
}

function renderCategoryPreview(files = []) {
  const previewElement = document.querySelector('#desktop-category-preview');

  if (!previewElement) {
    return;
  }

  const categoryCounts = files.reduce((counts, file) => {
    const categoryName = file.categoryName || '其他';

    counts.set(categoryName, (counts.get(categoryName) || 0) + 1);

    return counts;
  }, new Map());

  previewElement.innerHTML = getDesktopCategoryOrder(files).map((categoryName) => `
    <article class="category-preview-card">
      <span>${escapeHtml(categoryName)}</span>
      <strong>${categoryCounts.get(categoryName) || 0}</strong>
    </article>
  `).join('');
}

function hideOrganizePreview() {
  const previewPanel = document.querySelector('#desktop-organize-preview');
  const previewList = document.querySelector('#organize-preview-list');

  desktopOrganizePreviewToken = '';

  if (previewPanel) {
    previewPanel.hidden = true;
  }

  if (previewList) {
    previewList.innerHTML = '';
  }
}

function getOrganizeStatusLabel(entry) {
  if (entry.status === 'moved') {
    return '已移动';
  }

  if (entry.status === 'failed') {
    return '失败';
  }

  if (entry.status === 'skipped' || entry.action === 'skip') {
    return '跳过';
  }

  return '待移动';
}

function renderOrganizePreview(result, mode = 'preview') {
  const previewPanel = document.querySelector('#desktop-organize-preview');
  const previewMessage = document.querySelector('#organize-preview-message');
  const previewList = document.querySelector('#organize-preview-list');
  const confirmButton = document.querySelector('#confirm-organize-btn');
  const cancelButton = document.querySelector('#cancel-organize-btn');
  const entries = result.records || result.entries || [];

  if (!previewPanel || !previewMessage || !previewList) {
    return;
  }

  previewPanel.hidden = false;
  previewMessage.textContent = result.message || '请确认以下文件移动方案。';
  previewMessage.classList.toggle('is-error', !result.success);

  if (confirmButton) {
    confirmButton.hidden = mode === 'result';
    confirmButton.disabled = !result.success || !result.moveCount;
  }

  if (cancelButton) {
    cancelButton.textContent = mode === 'result' ? '关闭' : '取消';
  }

  if (!entries.length) {
    previewList.innerHTML = `
      <div class="empty-row">
        <strong>暂无可整理项目</strong>
        <span>请先扫描桌面，或确认当前桌面是否已有可移动文件。</span>
      </div>
    `;
    return;
  }

  previewList.innerHTML = entries.map((entry) => `
    <article class="organize-preview-row" data-status="${escapeHtml(entry.status || 'pending')}">
      <div class="organize-preview-name">
        <strong title="${escapeHtml(entry.fileName)}">${escapeHtml(entry.fileName)}</strong>
        <span title="${escapeHtml(entry.sourcePath)}">${escapeHtml(entry.sourcePath)}</span>
      </div>
      <span class="category-suggestion-pill" data-category="${escapeHtml(entry.categoryName || '其他')}">
        ${escapeHtml(entry.categoryName || '其他')}
      </span>
      <div class="organize-preview-target">
        <strong>${escapeHtml(getOrganizeStatusLabel(entry))}</strong>
        <span title="${escapeHtml(entry.targetPath || '')}">
          ${escapeHtml(entry.targetPath || entry.previewReason || entry.errorMessage || '')}
        </span>
      </div>
      <span class="category-reason-cell" title="${escapeHtml(entry.errorMessage || entry.previewReason || entry.categoryReason || '')}">
        ${escapeHtml(entry.errorMessage || entry.previewReason || entry.categoryReason || '')}
      </span>
    </article>
  `).join('');

  animateOrganizePreview(mode);
}

function renderDesktopFiles(files = []) {
  const listElement = document.querySelector('#desktop-file-list');
  const countElement = document.querySelector('#desktop-file-count');

  if (countElement) {
    countElement.textContent = `${files.length} 个`;
  }

  renderCategoryPreview(files);

  if (!listElement) {
    return;
  }

  if (!files.length) {
    listElement.innerHTML = `
      <div class="empty-row">
        <strong>暂无桌面扫描结果</strong>
        <span>点击“扫描桌面”后会在这里展示文件、文件夹和快捷方式。</span>
      </div>
    `;
    return;
  }

  listElement.innerHTML = files.map((file) => `
    <article class="desktop-file-row">
      <div class="file-name-cell">
        <strong title="${escapeHtml(file.fileName)}">${escapeHtml(file.fileName)}</strong>
        <span class="file-path-cell" title="${escapeHtml(file.filePath)}">${escapeHtml(file.filePath)}</span>
      </div>
      <span class="file-type-pill">${escapeHtml(file.fileType || '文件')}</span>
      <span>${escapeHtml(formatDesktopModifiedAt(file.modifiedAt))}</span>
      <span class="category-suggestion-pill" data-category="${escapeHtml(file.categoryName || '其他')}">
        ${escapeHtml(file.categoryName || '其他')}
      </span>
      <span class="category-reason-cell" title="${escapeHtml(file.categoryReason || '')}">
        ${escapeHtml(file.categoryReason || '未命中扩展名或关键词规则')}
      </span>
    </article>
  `).join('');

  animateDesktopScanResults();
}

async function refreshDesktopFiles() {
  if (!window.api?.getDesktopFiles) {
    renderDesktopFiles([]);
    setDesktopScanMessage('当前环境无法连接桌面扫描服务。', true);
    return;
  }

  try {
    const result = await window.api.getDesktopFiles();
    const files = result.files || [];

    renderDesktopFiles(files);
    setDesktopScanMessage(files.length ? `已加载 ${files.length} 条已保存扫描结果。` : '点击“扫描桌面”读取当前用户桌面文件。');
  } catch (error) {
    renderDesktopFiles([]);
    setDesktopScanMessage('读取已保存扫描结果失败，请稍后重试。', true);
  }
}

async function scanDesktopFiles() {
  const scanButton = document.querySelector('#scan-desktop-btn');
  let stopPendingAnimation = () => {};

  if (!window.api?.scanDesktopFiles) {
    setDesktopScanMessage('当前环境无法连接桌面扫描服务。', true);
    return;
  }

  try {
    hideOrganizePreview();

    stopPendingAnimation = startPendingActionAnimation(scanButton);

    if (scanButton) {
      scanButton.disabled = true;
      scanButton.textContent = '扫描中...';
    }

    setDesktopScanMessage('正在扫描桌面文件，请稍候...');

    // 文件系统扫描和 SQLite 写入都通过主进程 IPC 完成，渲染进程只负责展示结果。
    const result = await window.api.scanDesktopFiles();
    const files = result.files || [];

    renderDesktopFiles(files);
    setDesktopScanMessage(result.message || '扫描完成。', !result.success);
    showReservedMessage(result.message || '桌面扫描完成');
  } catch (error) {
    setDesktopScanMessage('扫描桌面失败，请检查桌面目录权限后重试。', true);
    showReservedMessage('扫描桌面失败');
  } finally {
    stopPendingAnimation?.();
    if (scanButton) {
      scanButton.disabled = false;
      scanButton.textContent = '扫描桌面';
    }
  }
}

async function previewDesktopOrganization() {
  const organizeButton = document.querySelector('#organize-desktop-btn');
  let stopPendingAnimation = () => {};

  if (!window.api?.previewDesktopOrganization) {
    setDesktopScanMessage('当前环境无法连接桌面整理服务。', true);
    return;
  }

  try {
    stopPendingAnimation = startPendingActionAnimation(organizeButton);

    if (organizeButton) {
      organizeButton.disabled = true;
      organizeButton.textContent = '生成预览中...';
    }

    setDesktopScanMessage('正在生成整理预览，请稍候...');

    const result = await window.api.previewDesktopOrganization();

    desktopOrganizePreviewToken = result.previewToken || '';
    renderOrganizePreview(result, 'preview');
    setDesktopScanMessage(result.message || '整理预览已生成。', !result.success);
    showReservedMessage(result.message || '整理预览已生成');
  } catch (error) {
    hideOrganizePreview();
    setDesktopScanMessage('生成整理预览失败，请稍后重试。', true);
    showReservedMessage('生成整理预览失败');
  } finally {
    stopPendingAnimation?.();
    if (organizeButton) {
      organizeButton.disabled = false;
      organizeButton.textContent = '一键整理';
    }
  }
}

async function confirmDesktopOrganization() {
  const confirmButton = document.querySelector('#confirm-organize-btn');
  let stopPendingAnimation = () => {};

  if (!window.api?.organizeDesktopFiles || !desktopOrganizePreviewToken) {
    setDesktopScanMessage('请先生成整理预览，再确认整理。', true);
    return;
  }

  try {
    stopPendingAnimation = startPendingActionAnimation(confirmButton);

    if (confirmButton) {
      confirmButton.disabled = true;
      confirmButton.textContent = '整理中...';
    }

    setDesktopScanMessage('正在整理桌面文件，请勿关闭应用...');

    // 只有用户在预览面板点击确认后，才会携带 confirmed 和 previewToken 执行移动。
    const result = await window.api.organizeDesktopFiles({
      confirmed: true,
      previewToken: desktopOrganizePreviewToken
    });

    desktopOrganizePreviewToken = '';
    renderOrganizePreview(result, 'result');
    renderDesktopFiles(result.files || []);
    setDesktopScanMessage(result.message || '桌面整理完成。', !result.success);
    showReservedMessage(result.message || '桌面整理完成');
  } catch (error) {
    setDesktopScanMessage('整理失败，请检查文件是否被占用或权限是否充足。', true);
    showReservedMessage('整理桌面失败');
  } finally {
    stopPendingAnimation?.();
    if (confirmButton) {
      confirmButton.disabled = false;
      confirmButton.textContent = '确认整理';
    }
  }
}

async function initializeThemeSettings() {
  if (!window.api?.getConfig) {
    loadThemeConfig();
    return;
  }

  try {
    loadThemeConfig(await window.api.getConfig());
  } catch (error) {
    loadThemeConfig();
  }
}

async function saveThemeSettings() {
  if (!window.api?.updateConfig) {
    showReservedMessage('当前环境无法保存主题设置');
    return;
  }

  try {
    const savedConfig = await window.api.updateConfig(themeDraftConfig || currentThemeConfig || {});

    loadThemeConfig(savedConfig);
    showReservedMessage('主题设置已保存');
  } catch (error) {
    showReservedMessage('主题设置保存失败');
  }
}

async function initializeSystemSettings() {
  if (!window.api?.getAutoStartSettings) {
    updateSystemControlValues({
      autoStart: false
    });
    setSystemSettingsMessage('当前环境无法读取开机自启动状态。', true);
    return;
  }

  try {
    updateSystemControlValues(await window.api.getAutoStartSettings());
  } catch (error) {
    updateSystemControlValues({
      autoStart: false
    });
    setSystemSettingsMessage('读取开机自启动状态失败，请稍后重试。', true);
  }
}

async function updateAutoStartSetting(enabled) {
  const autoStartInput = document.querySelector('#auto-start-input');
  const previousValue = Boolean(currentSystemConfig?.autoStart);

  if (!window.api?.updateAutoStartSettings) {
    updateSystemControlValues({
      autoStart: previousValue
    });
    setSystemSettingsMessage('当前环境无法修改开机自启动设置。', true);
    return;
  }

  try {
    if (autoStartInput) {
      autoStartInput.disabled = true;
    }

    setSystemSettingsMessage(enabled ? '正在开启开机自启动...' : '正在关闭开机自启动...');

    // 开机自启动属于系统级能力，只通过主进程 IPC 调用 Electron 登录项 API。
    const settings = await window.api.updateAutoStartSettings(enabled);

    updateSystemControlValues(settings);
    showReservedMessage(settings.autoStart ? '开机自启动已开启' : '开机自启动已关闭');
  } catch (error) {
    updateSystemControlValues({
      autoStart: previousValue
    });
    setSystemSettingsMessage('开机自启动设置失败，请检查系统权限后重试。', true);
    showReservedMessage('开机自启动设置失败');
  } finally {
    if (autoStartInput) {
      autoStartInput.disabled = false;
    }
  }
}

async function refreshWidgetList() {
  if (!window.api) {
    renderAddedWidgets([]);
    return true;
  }

  try {
    const [widgets, config] = await Promise.all([
      window.api.getWidgetList(),
      window.api.getConfig()
    ]);

    if (widgets?.success === false || config?.success === false) {
      throw new Error(widgets?.message || config?.message || '小组件列表读取失败。');
    }
    if (!Array.isArray(widgets)) {
      throw new Error('小组件列表格式无效。');
    }

    renderAddedWidgets(widgets, config.widgets || {});
    return true;
  } catch (error) {
    console.error('[renderer] 刷新小组件列表失败：', error);
    showReservedMessage(error?.message || '读取小组件列表失败，请稍后重试。');
    return false;
  }
}

function showReservedMessage(message) {
  const actionStatus = document.querySelector('#action-status');

  if (actionStatus) {
    actionStatus.textContent = message;
  }
}

async function runAddedWidgetAction(operation, successMessage) {
  try {
    const result = await operation();

    if (result?.success === false) {
      throw new Error(result.message || '操作失败，请稍后重试。');
    }

    showReservedMessage(successMessage);
    await refreshWidgetList();
    return result;
  } catch (error) {
    console.error('[renderer] 小组件操作失败：', error);
    showReservedMessage(error?.message || '操作失败，请稍后重试。');
    return null;
  }
}

function switchView(viewName) {
  const widgetsView = document.querySelector('#widgets-view');
  const desktopView = document.querySelector('#desktop-view');
  const themeView = document.querySelector('#theme-view');
  const systemView = document.querySelector('#system-view');
  const titleElement = document.querySelector('#view-title');
  const refreshButton = document.querySelector('#refresh-widget-list-btn');
  const widgetCount = document.querySelector('#widget-count');
  const actionStatus = document.querySelector('#action-status');

  document.querySelectorAll('.nav-item').forEach((item) => {
    item.classList.toggle('is-active', item.dataset.view === viewName);
  });
  document.body.dataset.activeView = viewName;

  if (viewName === 'widgets') {
    widgetsView?.classList.add('is-active');
    desktopView?.classList.remove('is-active');
    themeView?.classList.remove('is-active');
    systemView?.classList.remove('is-active');

    if (titleElement) {
      titleElement.textContent = '组件管理';
    }

    if (refreshButton) {
      refreshButton.hidden = false;
    }
    if (widgetCount) {
      widgetCount.hidden = false;
    }
    if (actionStatus) {
      actionStatus.hidden = false;
    }

    animateViewPanel(widgetsView);
    return;
  }

  if (viewName === 'desktop') {
    widgetsView?.classList.remove('is-active');
    desktopView?.classList.add('is-active');
    themeView?.classList.remove('is-active');
    systemView?.classList.remove('is-active');

    if (titleElement) {
      titleElement.textContent = '桌面分类';
    }

    if (refreshButton) {
      refreshButton.hidden = true;
    }
    if (widgetCount) {
      widgetCount.hidden = true;
    }
    if (actionStatus) {
      actionStatus.hidden = true;
    }

    animateViewPanel(desktopView);
    refreshDesktopFiles();
    return;
  }

  if (viewName === 'theme') {
    widgetsView?.classList.remove('is-active');
    desktopView?.classList.remove('is-active');
    themeView?.classList.add('is-active');
    systemView?.classList.remove('is-active');

    if (titleElement) {
      titleElement.textContent = '主题设置';
    }

    if (refreshButton) {
      refreshButton.hidden = true;
    }
    if (widgetCount) {
      widgetCount.hidden = true;
    }
    if (actionStatus) {
      actionStatus.hidden = true;
    }

    animateViewPanel(themeView);
    updateThemeControlValues(themeDraftConfig || currentThemeConfig || {});
    return;
  }

  if (viewName === 'system') {
    widgetsView?.classList.remove('is-active');
    desktopView?.classList.remove('is-active');
    themeView?.classList.remove('is-active');
    systemView?.classList.add('is-active');

    if (titleElement) {
      titleElement.textContent = '系统设置';
    }

    if (refreshButton) {
      refreshButton.hidden = true;
    }
    if (widgetCount) {
      widgetCount.hidden = true;
    }
    if (actionStatus) {
      actionStatus.hidden = true;
    }

    animateViewPanel(systemView);
    initializeSystemSettings();
    return;
  }

  // 只允许已实现的四个视图；未知值退回组件管理，避免展示过时的占位页。
  switchView('widgets');
}

function bindNavigation() {
  document.querySelectorAll('.nav-item').forEach((navItem) => {
    navItem.addEventListener('click', () => {
      switchView(navItem.dataset.view);
    });
  });
}

function bindWidgetActions() {
  const availableGrid = document.querySelector('#available-widget-grid');
  const addedList = document.querySelector('#added-widget-list');
  const refreshButton = document.querySelector('#refresh-widget-list-btn');

  refreshButton?.addEventListener('click', async () => {
    refreshButton.classList.add('is-loading');
    refreshButton.disabled = true;

    try {
      if (await refreshWidgetList()) {
        showReservedMessage('列表已刷新');
      }
    } finally {
      refreshButton.classList.remove('is-loading');
      refreshButton.disabled = false;
    }
  });

  availableGrid?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-add-widget-type]');

    if (!button || !window.api) {
      return;
    }

    if (button.dataset.busy === '1') {
      return;
    }

    const widgetType = button.dataset.addWidgetType;
    const widgetTemplate = AVAILABLE_WIDGETS.find((widget) => widget.type === widgetType);

    button.dataset.busy = '1';
    button.disabled = true;
    try {
      // 添加按钮通过主进程 IPC 写入 SQLite，渲染进程不直接访问数据库。
      const result = await window.api.createWidget({
        type: widgetType,
        name: widgetTemplate?.defaultName || '桌面小组件'
      });

      if (result?.success === false) {
        throw new Error(result.message || '小组件创建失败。');
      }

      showReservedMessage(`已添加 ${widgetTemplate?.defaultName || '桌面小组件'}`);
      await refreshWidgetList();
    } catch (error) {
      showReservedMessage(error?.message || '添加小组件失败');
    } finally {
      button.dataset.busy = '0';
      button.disabled = false;
    }
  });

  addedList?.addEventListener('click', async (event) => {
    const deleteButton = event.target.closest('[data-delete-widget-id]');
    const toggleButton = event.target.closest('[data-toggle-widget-id]');
    const lockedButton = event.target.closest('[data-toggle-locked-widget-id]');
    const reservedButton = event.target.closest('[data-reserved-action]');

    if (deleteButton && window.api) {
      const shouldDelete = window.confirm('确认删除该小组件记录吗？');

      if (!shouldDelete) {
        showReservedMessage('已取消删除');
        return;
      }

      // 删除操作通过主进程 IPC 执行，删除后立即刷新列表。
      await runAddedWidgetAction(
        () => window.api.deleteWidget(Number(deleteButton.dataset.deleteWidgetId)),
        '已删除小组件'
      );
      return;
    }

    if (toggleButton && window.api) {
      const widgetId = Number(toggleButton.dataset.toggleWidgetId);
      const nextVisible = toggleButton.dataset.nextVisible === '1';

      // 隐藏/显示状态通过主进程 IPC 更新 widgets.visible。
      await runAddedWidgetAction(
        () => window.api.updateWidgetVisible(widgetId, nextVisible),
        nextVisible ? '已显示小组件' : '已隐藏小组件'
      );
      return;
    }

    if (lockedButton && window.api) {
      const widgetId = Number(lockedButton.dataset.toggleLockedWidgetId);
      const nextLocked = lockedButton.dataset.nextLocked === '1';

      await runAddedWidgetAction(
        () => window.api.updateWidgetLayoutConfig(widgetId, {
          locked: nextLocked
        }),
        nextLocked ? '已锁定小组件' : '已解锁小组件'
      );
      return;
    }

    if (reservedButton && window.api?.openWidgetSettings) {
      const widgetId = Number(reservedButton.dataset.widgetId);
      await runAddedWidgetAction(
        () => window.api.openWidgetSettings(widgetId),
        '已打开小组件设置'
      );
    }
  });

  addedList?.addEventListener('change', async (event) => {
    const windowModeSelect = event.target.closest('[data-window-mode-widget-id]');
    const opacityInput = event.target.closest('[data-opacity-widget-id]');

    if (windowModeSelect && window.api?.setWidgetWindowMode) {
      const widgetId = Number(windowModeSelect.dataset.windowModeWidgetId);
      const labels = {
        desktop: '固定到桌面',
        normal: '普通窗口',
        alwaysOnTop: '始终置顶'
      };

      await runAddedWidgetAction(
        () => window.api.setWidgetWindowMode(widgetId, windowModeSelect.value),
        `显示层级已切换为${labels[windowModeSelect.value]}`
      );
      return;
    }

    if (!opacityInput || !window.api) {
      return;
    }

    const widgetId = Number(opacityInput.dataset.opacityWidgetId);
    const opacity = Number(opacityInput.value);

    await runAddedWidgetAction(
      () => window.api.updateWidgetLayoutConfig(widgetId, {
        opacity
      }),
      `已保存透明度 ${Math.round(opacity * 100)}%`
    );
  });

  addedList?.addEventListener('input', (event) => {
    const opacityInput = event.target.closest('[data-opacity-widget-id]');

    if (!opacityInput) {
      return;
    }

    const opacityPercent = Math.round(Number(opacityInput.value) * 100);
    const opacityValue = opacityInput.closest('.opacity-control')?.querySelector('[data-opacity-value]');

    opacityInput.style.setProperty('--range-progress', `${opacityPercent}%`);
    if (opacityValue) {
      opacityValue.textContent = `${opacityPercent}%`;
    }
  });
}

function bindWindowControls() {
  document.querySelector('#window-minimize-btn')?.addEventListener('click', () => {
    window.windowControls?.minimize();
  });
  document.querySelector('#window-maximize-btn')?.addEventListener('click', () => {
    window.windowControls?.toggleMaximize();
  });
  document.querySelector('#window-close-btn')?.addEventListener('click', () => {
    window.windowControls?.close();
  });
}

// 渲染进程入口：初始化管理中心页面，并通过 preload 暴露的 window.api 调用主进程。
function bindDesktopScanActions() {
  const scanButton = document.querySelector('#scan-desktop-btn');
  const organizeButton = document.querySelector('#organize-desktop-btn');
  const confirmButton = document.querySelector('#confirm-organize-btn');
  const cancelButton = document.querySelector('#cancel-organize-btn');

  scanButton?.addEventListener('click', scanDesktopFiles);
  organizeButton?.addEventListener('click', previewDesktopOrganization);
  confirmButton?.addEventListener('click', confirmDesktopOrganization);
  cancelButton?.addEventListener('click', hideOrganizePreview);
}

function bindThemeSettingsActions() {
  const opacityInput = document.querySelector('#theme-opacity-input');
  const radiusInput = document.querySelector('#theme-radius-input');
  const fontSizeInput = document.querySelector('#theme-font-size-input');
  const shadowInput = document.querySelector('#theme-shadow-input');
  const saveButton = document.querySelector('#save-theme-btn');

  document.querySelectorAll('[data-theme-option]').forEach((button) => {
    button.addEventListener('click', () => {
      updateThemeDraft({
        theme: button.dataset.themeOption
      });
    });
  });

  opacityInput?.addEventListener('input', () => {
    updateThemeDraft({
      globalOpacity: Number(opacityInput.value)
    });
  });

  radiusInput?.addEventListener('input', () => {
    updateThemeDraft({
      borderRadius: Number(radiusInput.value)
    });
  });

  fontSizeInput?.addEventListener('input', () => {
    updateThemeDraft({
      fontSize: Number(fontSizeInput.value)
    });
  });

  shadowInput?.addEventListener('change', () => {
    updateThemeDraft({
      shadow: shadowInput.checked
    });
  });

  saveButton?.addEventListener('click', saveThemeSettings);
}

function bindSystemSettingsActions() {
  const autoStartInput = document.querySelector('#auto-start-input');

  autoStartInput?.addEventListener('change', () => {
    updateAutoStartSetting(autoStartInput.checked);
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  document.body.dataset.activeView = 'widgets';
  await initializeThemeSettings();
  await initializeSystemSettings();
  renderAvailableWidgets();
  bindWindowControls();
  bindNavigation();
  bindWidgetActions();
  bindDesktopScanActions();
  bindThemeSettingsActions();
  bindSystemSettingsActions();
  setApiStatus(Boolean(window.api));
  showReservedMessage('准备就绪');
  await refreshWidgetList();
});
