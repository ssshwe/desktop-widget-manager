const WIDGET_DEFINITIONS = {
  clock: { script: './widgets/clockWidget.js', globalName: 'ClockWidget', label: '时钟' },
  weather: { script: './widgets/weatherWidget.js', globalName: 'WeatherWidget', label: '天气' },
  todo: { script: './widgets/todoWidget.js', globalName: 'TodoWidget', label: '待办' },
  notes: { script: './widgets/notesWidget.js', globalName: 'NotesWidget', label: '快速便签' },
  schedule: { script: './widgets/scheduleWidget.js', globalName: 'ScheduleWidget', label: '日程提醒' },
  floatingFolder: { script: './widgets/floatingFolderWidget.js', globalName: 'FloatingFolderWidget', label: '文件夹' }
};

const WIDGET_SIZE_PRESETS = {
  compact: { label: '紧凑', width: 260, height: 180 },
  comfortable: { label: '标准', width: 340, height: 300 },
  large: { label: '宽大', width: 420, height: 420 }
};
const CLOCK_WIDGET_SIZE_PRESETS = {
  compact: { label: '紧凑', width: 300, height: 200 },
  comfortable: { label: '标准', width: 480, height: 320 },
  large: { label: '宽大', width: 660, height: 440 }
};
const NOTES_WIDGET_SIZE_PRESETS = {
  compact: { label: '紧凑', width: 340, height: 440 },
  comfortable: { label: '标准', width: 380, height: 500 },
  large: { label: '宽大', width: 480, height: 660 }
};
const TODO_SIZE_PRESETS = {
  compact: { label: '紧凑', width: 420, height: 420 },
  comfortable: { label: '标准', width: 520, height: 500 },
  large: { label: '宽大', width: 620, height: 560 }
};

let currentWidgetParams = null;
let currentWidgetConfig = {};
const loadedWidgetScripts = new Map();
const DwmUi = window.DwmUi;
let mountedWidgetRenderer = null;
let widgetHeaderEventsBound = false;

const escapeHtml = DwmUi.escapeHtml;

function getWidgetParams() {
  const params = new URLSearchParams(window.location.search);

  return {
    id: Number(params.get('id')),
    type: params.get('type') || 'clock',
    name: params.get('name') || '桌面小组件'
  };
}

function getWidgetTypeClass(type) {
  return `widget-type-${String(type).replace(/[^a-zA-Z0-9_-]/g, '-')}`;
}

function getWidgetDefinition(type) {
  return WIDGET_DEFINITIONS[type] || WIDGET_DEFINITIONS.clock;
}

function getWidgetSizePresets() {
  if (currentWidgetParams?.type === 'clock') {
    return CLOCK_WIDGET_SIZE_PRESETS;
  }

  if (currentWidgetParams?.type === 'notes') {
    return NOTES_WIDGET_SIZE_PRESETS;
  }

  if (currentWidgetParams?.type === 'todo') {
    return TODO_SIZE_PRESETS;
  }

  return WIDGET_SIZE_PRESETS;
}

function loadWidgetScript(type) {
  const definition = getWidgetDefinition(type);

  if (window[definition.globalName]) {
    return Promise.resolve(window[definition.globalName]);
  }

  if (loadedWidgetScripts.has(definition.script)) {
    return loadedWidgetScripts.get(definition.script);
  }

  const loadPromise = new Promise((resolve, reject) => {
    const scriptElement = document.createElement('script');

    scriptElement.src = definition.script;
    scriptElement.onload = () => {
      const renderer = window[definition.globalName];

      if (renderer) {
        resolve(renderer);
        return;
      }

      reject(new Error(`小组件脚本未注册渲染器：${definition.globalName}`));
    };
    scriptElement.onerror = () => reject(new Error(`小组件脚本加载失败：${definition.script}`));

    // 按需加载当前类型脚本，避免每个小组件窗口加载所有无关组件资源。
    document.head.appendChild(scriptElement);
  });

  loadedWidgetScripts.set(definition.script, loadPromise);

  return loadPromise;
}

async function getWidgetRenderer(type) {
  const definition = getWidgetDefinition(type);

  try {
    const renderer = await loadWidgetScript(type);

    return renderer;
  } catch (error) {
    console.error('[widget-renderer] 小组件脚本加载失败，回退到时钟组件：', error);

    if (type !== 'clock') {
      await loadWidgetScript('clock');
      return window.ClockWidget;
    }

    return {
      label: definition.label,
      render: () => '<section class="clock-widget"><strong>小组件加载失败</strong></section>'
    };
  }
}

const clampNumber = DwmUi.clampNumber;
const normalizeThemeConfig = DwmUi.normalizeThemeConfig;

const applyThemeConfig = DwmUi.applyThemeConfig;

function getCurrentWidgetConfig(config = {}) {
  if (!currentWidgetParams?.id || !config.widgets) {
    return {};
  }

  return DwmUi.getWidgetConfig(config.widgets, currentWidgetParams.id);
}

async function refreshWidgetConfig() {
  if (!window.api?.getConfig) {
    return currentWidgetConfig;
  }

  try {
    const config = await window.api.getConfig();
    currentWidgetConfig = {
      ...currentWidgetConfig,
      ...getCurrentWidgetConfig(config)
    };
  } catch (error) {
    currentWidgetConfig = {
      ...currentWidgetConfig
    };
  }

  return currentWidgetConfig;
}

function normalizeWidgetOpacity(value) {
  return clampNumber(value, 0.3, 1, 1);
}

async function updateLayoutConfig(partialConfig = {}) {
  if (!window.api?.updateWidgetLayoutConfig || !Number.isInteger(currentWidgetParams?.id)) {
    return currentWidgetConfig;
  }

  // 右键菜单的置顶、锁定、透明度和尺寸都保存到 config.json，重启后会恢复。
  currentWidgetConfig = await window.api.updateWidgetLayoutConfig(currentWidgetParams.id, partialConfig);

  return currentWidgetConfig;
}

function getCurrentWindowMode() {
  if (DwmUi.isWindowMode(currentWidgetConfig.windowMode)) {
    return currentWidgetConfig.windowMode;
  }
  return currentWidgetConfig.pinned === false ? 'normal' : 'desktop';
}

async function updateWindowMode(mode) {
  if (!DwmUi.isWindowMode(mode)) {
    throw new Error(`窗口模式无效：${String(mode)}`);
  }

  if (window.api?.setWidgetWindowMode && Number.isInteger(currentWidgetParams?.id)) {
    const result = await window.api.setWidgetWindowMode(currentWidgetParams.id, mode);
    currentWidgetConfig = {
      ...currentWidgetConfig,
      windowMode: result.windowMode,
      pinned: result.windowMode === 'desktop'
    };
    return currentWidgetConfig;
  }

  return updateLayoutConfig({
    windowMode: mode
  });
}

function closeWidgetContextMenu() {
  document.querySelector('#widget-context-menu')?.remove();
  document.querySelector('#widget-settings-popover')?.remove();
  document.querySelector('#more-widget-btn')?.setAttribute('aria-expanded', 'false');
  document.querySelector('#settings-widget-btn')?.setAttribute('aria-expanded', 'false');
}

function positionFloatingPanel(panel, x, y) {
  const margin = 10;
  const availableWidth = Math.max(0, window.innerWidth - (margin * 2));
  const availableHeight = Math.max(0, window.innerHeight - (margin * 2));

  panel.style.maxWidth = `${availableWidth}px`;
  panel.style.maxHeight = `${availableHeight}px`;

  panel.style.left = `${Math.max(margin, Math.min(x, window.innerWidth - panel.offsetWidth - margin))}px`;
  panel.style.top = `${Math.max(margin, Math.min(y, window.innerHeight - panel.offsetHeight - margin))}px`;
}

function getContextMenuState() {
  const windowMode = getCurrentWindowMode();
  return {
    opacity: normalizeWidgetOpacity(currentWidgetConfig.opacity),
    windowMode,
    pinned: windowMode === 'desktop',
    locked: Boolean(currentWidgetConfig.locked)
  };
}

function syncWidgetHeaderActions() {
  const pinButton = document.querySelector('#pin-widget-btn');
  const opacityButton = document.querySelector('#todo-opacity-btn');
  const isPinned = getCurrentWindowMode() === 'desktop';
  const opacityPercent = Math.round(normalizeWidgetOpacity(currentWidgetConfig.opacity) * 100);

  if (pinButton) {
    pinButton.classList.toggle('is-active', isPinned);
    pinButton.setAttribute('aria-pressed', String(isPinned));
    pinButton.setAttribute('aria-label', isPinned ? '取消固定到桌面' : '固定到桌面');
  }

  if (opacityButton) {
    opacityButton.setAttribute('aria-label', `调整透明度，当前 ${opacityPercent}%`);
  }
}

function closeTodoOpacityPopover() {
  document.querySelector('#todo-opacity-popover')?.remove();
  document.querySelector('#todo-opacity-btn')?.setAttribute('aria-expanded', 'false');
}

async function openTodoOpacityPopover(anchor) {
  const existing = document.querySelector('#todo-opacity-popover');

  if (existing) {
    closeTodoOpacityPopover();
    return;
  }

  await refreshWidgetConfig();

  const opacityPercent = Math.round(normalizeWidgetOpacity(currentWidgetConfig.opacity) * 100);
  const popover = document.createElement('aside');
  const anchorRect = anchor.getBoundingClientRect();

  popover.id = 'todo-opacity-popover';
  popover.className = 'todo-opacity-popover';
  popover.innerHTML = `
    <label for="todo-opacity-range">
      <span>组件透明度</span>
      <output id="todo-opacity-output">${opacityPercent}%</output>
    </label>
    <input id="todo-opacity-range" type="range" min="30" max="100" step="5" value="${opacityPercent}" aria-label="组件透明度" />
    <div class="todo-opacity-scale" aria-hidden="true">
      <span>30%</span>
      <span>100%</span>
    </div>
  `;

  document.body.appendChild(popover);
  anchor.setAttribute('aria-expanded', 'true');
  positionFloatingPanel(popover, anchorRect.right - popover.offsetWidth, anchorRect.bottom + 7);

  popover.querySelector('#todo-opacity-range')?.addEventListener('input', async (event) => {
    const percent = Number(event.target.value);

    popover.querySelector('#todo-opacity-output').value = `${percent}%`;
    await updateLayoutConfig({
      opacity: percent / 100
    });
    syncWidgetHeaderActions();
  });
}

function renderWidgetSettingsPopover(x, y) {
  const state = getContextMenuState();
  const popover = document.createElement('aside');
  const opacityPercent = Math.round(state.opacity * 100);

  document.querySelector('#widget-settings-popover')?.remove();
  popover.id = 'widget-settings-popover';
  popover.className = 'widget-settings-popover';
  popover.innerHTML = `
    <div class="widget-settings-head">
      <div><strong>组件设置</strong><span>显示与布局</span></div>
      <button type="button" data-settings-close aria-label="关闭设置" title="关闭设置"><img src="./assets/ui-icons/phosphor-x.svg" alt="" /></button>
    </div>
    <label class="widget-settings-row widget-settings-opacity-row">
      <span class="widget-settings-label">
        <span>透明度</span>
        <output data-settings-opacity-output>${opacityPercent}%</output>
      </span>
      <input type="range" min="0.3" max="1" step="0.05" value="${state.opacity}" data-settings-opacity />
    </label>
    <div class="widget-settings-row">
      <span class="widget-settings-label">组件尺寸</span>
      <div class="widget-size-grid">
        ${Object.entries(getWidgetSizePresets()).map(([key, preset]) => `
          <button
            type="button"
            class="${Number(currentWidgetConfig.width) === preset.width && Number(currentWidgetConfig.height) === preset.height ? 'is-active' : ''}"
            data-settings-size="${escapeHtml(key)}"
          >${escapeHtml(preset.label)}</button>
        `).join('')}
      </div>
    </div>
    <fieldset class="widget-settings-row widget-window-mode-options">
      <legend class="widget-settings-label">显示层级</legend>
      <label><input type="radio" name="widget-window-mode" value="desktop" data-settings-window-mode ${state.windowMode === 'desktop' ? 'checked' : ''} /><span>固定到桌面</span></label>
      <label><input type="radio" name="widget-window-mode" value="normal" data-settings-window-mode ${state.windowMode === 'normal' ? 'checked' : ''} /><span>普通窗口</span></label>
      <label><input type="radio" name="widget-window-mode" value="alwaysOnTop" data-settings-window-mode ${state.windowMode === 'alwaysOnTop' ? 'checked' : ''} /><span>始终置顶</span></label>
    </fieldset>
    <label class="widget-check-row">
      <span class="widget-check-copy">
        <strong>锁定位置</strong>
        <small>避免意外拖动组件</small>
      </span>
      <input type="checkbox" data-settings-locked ${state.locked ? 'checked' : ''} />
      <span class="widget-toggle-track" aria-hidden="true"></span>
    </label>
  `;

  document.body.appendChild(popover);
  document.querySelector('#settings-widget-btn')?.setAttribute('aria-expanded', 'true');
  positionFloatingPanel(popover, x, y);

  popover.querySelector('[data-settings-close]')?.addEventListener('click', () => {
    closeWidgetContextMenu();
  });

  popover.querySelector('[data-settings-opacity]')?.addEventListener('input', async (event) => {
    const opacity = normalizeWidgetOpacity(event.target.value);
    const output = popover.querySelector('[data-settings-opacity-output]');

    if (output) {
      output.textContent = `${Math.round(opacity * 100)}%`;
    }

    await updateLayoutConfig({
      opacity
    });
  });

  popover.querySelectorAll('[data-settings-size]').forEach((button) => {
    button.addEventListener('click', async () => {
      const preset = getWidgetSizePresets()[button.dataset.settingsSize];

      if (preset) {
        await updateLayoutConfig({
          width: preset.width,
          height: preset.height
        });
        popover.querySelectorAll('[data-settings-size]').forEach((sizeButton) => {
          sizeButton.classList.toggle('is-active', sizeButton === button);
        });
      }
    });
  });

  popover.querySelectorAll('[data-settings-window-mode]').forEach((input) => {
    input.addEventListener('change', async (event) => {
      if (event.target.checked) await updateWindowMode(event.target.value);
    });
  });

  popover.querySelector('[data-settings-locked]')?.addEventListener('change', async (event) => {
    await updateLayoutConfig({
      locked: event.target.checked
    });
    document.body.classList.toggle('is-locked', event.target.checked);
  });
}

async function renameCurrentWidget() {
  if (!window.api?.updateWidget || !Number.isInteger(currentWidgetParams?.id)) {
    return;
  }

  const nextName = window.prompt('请输入新的组件名称', currentWidgetParams.name);

  if (!nextName || !nextName.trim() || nextName.trim() === currentWidgetParams.name) {
    return;
  }

  const widget = await window.api.updateWidget(currentWidgetParams.id, {
    name: nextName.trim()
  });

  currentWidgetParams = {
    ...currentWidgetParams,
    name: widget.name
  };
  document.title = widget.name;
  document.querySelector('.widget-kicker')?.replaceChildren(document.createTextNode(widget.name));
}

async function hideCurrentWidget() {
  if (window.api?.updateWidgetVisible && Number.isInteger(currentWidgetParams?.id)) {
    await window.api.updateWidgetVisible(currentWidgetParams.id, false);
  }
}

async function deleteCurrentWidget() {
  if (!window.api?.deleteWidget || !Number.isInteger(currentWidgetParams?.id)) {
    return;
  }

  const shouldDelete = window.confirm('确认删除该小组件吗？删除后管理中心也会移除该组件记录。');

  if (shouldDelete) {
    await window.api.deleteWidget(currentWidgetParams.id);
  }
}

async function handleContextMenuAction(action) {
  if (action === 'edit') {
    await renameCurrentWidget();
  } else if (action === 'hide') {
    await hideCurrentWidget();
  } else if (action === 'delete') {
    await deleteCurrentWidget();
  }

  closeWidgetContextMenu();
}

async function openWidgetContextMenuAt(x, y) {
  if (!Number.isInteger(currentWidgetParams?.id)) {
    return;
  }

  await refreshWidgetConfig();

  const menu = document.createElement('nav');

  closeWidgetContextMenu();
  menu.id = 'widget-context-menu';
  menu.className = 'widget-context-menu';
  menu.innerHTML = `
    <div class="widget-menu-head"><strong>更多操作</strong></div>
    <button type="button" data-menu-action="edit">
      <img src="./assets/ui-icons/phosphor-pencil-simple.svg" alt="" />重命名组件
    </button>
    <button type="button" data-menu-action="hide">
      <img src="./assets/ui-icons/window-minus.svg" alt="" />隐藏组件
    </button>
    <button type="button" data-menu-action="delete" class="is-danger">
      <img src="./assets/ui-icons/phosphor-trash.svg" alt="" />删除组件
    </button>
  `;

  document.body.appendChild(menu);
  document.querySelector('#more-widget-btn')?.setAttribute('aria-expanded', 'true');
  positionFloatingPanel(menu, x, y);

  menu.addEventListener('click', async (clickEvent) => {
    const button = clickEvent.target.closest('[data-menu-action]');

    if (!button) {
      return;
    }

    await handleContextMenuAction(button.dataset.menuAction);
  });
}

async function showWidgetContextMenu(event) {
  if (currentWidgetParams?.type === 'todo') {
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  if (currentWidgetParams?.type === 'floatingFolder') {
    // 快捷收纳区只在文件图标上显示自己的文件菜单；空白处不显示通用组件菜单。
    event.preventDefault();
    event.stopPropagation();
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  await openWidgetContextMenuAt(event.clientX, event.clientY);
}

function bindWidgetContextMenu() {
  document.addEventListener('contextmenu', showWidgetContextMenu);
  window.addEventListener('widget-context-menu-requested', async (event) => {
    if (currentWidgetParams?.type === 'floatingFolder' || currentWidgetParams?.type === 'todo') {
      return;
    }

    const detail = event.detail || {};

    // 主进程会在拖拽区域右键时派发该事件，保证任意组件区域都能打开同一套菜单。
    await openWidgetContextMenuAt(Number(detail.x) || 12, Number(detail.y) || 12);
  });
  window.addEventListener('widget-open-settings-requested', async () => {
    await refreshWidgetConfig();
    renderWidgetSettingsPopover(Math.max(12, window.innerWidth - 292), 54);
  });
  document.addEventListener('click', (event) => {
    if (!event.target.closest('#todo-opacity-popover') && !event.target.closest('#todo-opacity-btn')) {
      closeTodoOpacityPopover();
    }

    if (
      event.target.closest('#widget-context-menu')
      || event.target.closest('#widget-settings-popover')
    ) {
      return;
    }

    closeWidgetContextMenu();
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeWidgetContextMenu();
      closeTodoOpacityPopover();
    }
  });
}

async function unmountCurrentWidget() {
  const renderer = mountedWidgetRenderer;
  mountedWidgetRenderer = null;

  if (!renderer?.unmount) {
    return;
  }

  try {
    await renderer.unmount(currentWidgetParams);
  } catch (error) {
    console.warn('[widget-renderer] Widget unmount failed.', error);
  }
}

async function renderWidget() {
  await unmountCurrentWidget();
  const params = currentWidgetParams || getWidgetParams();
  const renderer = await getWidgetRenderer(params.type);
  const definition = getWidgetDefinition(params.type);
  const labelElement = document.querySelector('#widget-type-label');
  const contentElement = document.querySelector('#widget-content');
  const urlParams = new URLSearchParams(window.location.search);
  const locked = urlParams.get('locked') === '1';
  const opacity = Number(urlParams.get('opacity'));

  if (!labelElement || !contentElement) return;

  currentWidgetParams = params;
  currentWidgetConfig = {
    ...currentWidgetConfig,
    locked
  };
  document.title = params.name;
  // 给不同类型的小组件挂载独立 class，便于每个小组件拥有自己的窗口形态。
  [...document.body.classList]
    .filter((className) => className.startsWith('widget-type-'))
    .forEach((className) => document.body.classList.remove(className));
  document.body.classList.add(getWidgetTypeClass(params.type));
  document.body.classList.toggle('is-locked', locked);
  document.body.classList.toggle('is-fully-opaque', Number.isFinite(opacity) && opacity >= 0.999);
  labelElement.textContent = renderer.label || definition.label;
  contentElement.innerHTML = renderer.render(params);

  if (renderer.mount) {
    mountedWidgetRenderer = renderer;
    await Promise.resolve(renderer.mount(params)).catch((error) => {
      console.error('[widget-renderer] 小组件挂载失败：', error);
    });
  }

  if (!widgetHeaderEventsBound) {
    document.querySelector('#hide-widget-btn')?.addEventListener('click', async () => {
    if (window.api && Number.isInteger(params.id)) {
      // 点击小组件内部关闭按钮时，只隐藏窗口并更新 visible，不删除数据库记录。
      await window.api.updateWidgetVisible(params.id, false);
    }
  });

  document.querySelector('#pin-widget-btn')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await refreshWidgetConfig();
    await updateWindowMode(getCurrentWindowMode() === 'desktop' ? 'normal' : 'desktop');
    syncWidgetHeaderActions();
  });

  document.querySelector('#settings-widget-btn')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const anchorRect = event.currentTarget.getBoundingClientRect();

    await refreshWidgetConfig();
    closeWidgetContextMenu();

    renderWidgetSettingsPopover(anchorRect.right - 278, anchorRect.bottom + 8);
  });

  document.querySelector('#more-widget-btn')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    const anchorRect = event.currentTarget.getBoundingClientRect();

    if (document.querySelector('#widget-context-menu')) {
      closeWidgetContextMenu();
      return;
    }

    await openWidgetContextMenuAt(anchorRect.right - 226, anchorRect.bottom + 8);
  });

    widgetHeaderEventsBound = true;
  }

  document.querySelector('#todo-opacity-btn')?.addEventListener('click', async (event) => {
    event.stopPropagation();
    await openTodoOpacityPopover(event.currentTarget);
  });

  await refreshWidgetConfig();
  syncWidgetHeaderActions();
}

function bindWidgetMetadataUpdates() {
  window.addEventListener('widget-metadata-updated', (event) => {
    const detail = event.detail || {};

    if (!detail.name || Number(detail.id) !== Number(currentWidgetParams?.id)) {
      return;
    }

    currentWidgetParams = {
      ...currentWidgetParams,
      name: detail.name
    };
    document.title = detail.name;
    document.querySelector('.widget-kicker')?.replaceChildren(document.createTextNode(detail.name));
  });
}

window.addEventListener('DOMContentLoaded', async () => {
  if (window.api?.getConfig) {
    try {
      applyThemeConfig(await window.api.getConfig());
    } catch (error) {
      applyThemeConfig();
    }
  } else {
    applyThemeConfig();
  }

  await renderWidget();
  bindWidgetContextMenu();
  bindWidgetMetadataUpdates();
});

window.addEventListener('beforeunload', () => {
  unmountCurrentWidget();
});
