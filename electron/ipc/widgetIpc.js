const { safeIpcHandle } = require('./safeIpc');
const {
  createWidget,
  deleteWidget,
  getWidgetList,
  updateWidget,
  updateWidgetVisible
} = require('../services/widgetService');
const { VALID_WINDOW_MODES } = require('../services/windowModeService');

function registerWidgetIpc(widgetWindowService) {
  safeIpcHandle('get-widget-list', () => getWidgetList(), {
    message: '读取小组件列表失败，请稍后重试。',
    fallbackValue: []
  });

  safeIpcHandle('create-widget', (event, widgetData) => {
    const widget = createWidget(widgetData);

    if (widgetData?.layoutConfig && typeof widgetData.layoutConfig === 'object') {
      widgetWindowService?.updateWidgetWindowConfig?.(widget.id, widgetData.layoutConfig);
    }

    // 添加小组件记录后立即创建独立桌面窗口。
    widgetWindowService?.createWidgetWindow(widget);

    return widget;
  }, {
    message: '添加小组件失败，请稍后重试。'
  });

  safeIpcHandle('delete-widget', (event, widgetId) => {
    // 删除记录前先关闭对应独立窗口，避免留下孤立窗口。
    widgetWindowService?.closeWidgetWindow(widgetId);

    return deleteWidget(widgetId);
  }, {
    message: '删除小组件失败，请稍后重试。'
  });

  safeIpcHandle('update-widget', (event, widgetId, widgetData) => {
    const widget = updateWidget(widgetId, widgetData);

    widgetWindowService?.updateWidgetWindowMetadata?.(widget);

    return widget;
  }, {
    message: '更新小组件失败，请稍后重试。'
  });

  safeIpcHandle('update-widget-visible', (event, widgetId, visible) => {
    const result = updateWidgetVisible(widgetId, visible);

    if (visible && result.widget) {
      widgetWindowService?.createWidgetWindow(result.widget);
    } else {
      widgetWindowService?.closeWidgetWindow(widgetId);
    }

    return result;
  }, {
    message: '更新小组件显示状态失败，请稍后重试。'
  });

  safeIpcHandle('update-widget-layout-config', (event, widgetId, layoutConfig) => {
    // 透明度、置顶和锁定状态保存到 config.json，并立即应用到已打开的小组件窗口。
    return widgetWindowService?.updateWidgetWindowConfig(widgetId, layoutConfig);
  }, {
    message: '保存小组件布局失败，请稍后重试。'
  });

  safeIpcHandle('get-widget-window-mode', (event, widgetId) => {
    const id = Number(widgetId);
    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('小组件 ID 必须是正整数。');
    }
    return widgetWindowService?.getWidgetWindowMode?.(id);
  }, {
    message: '读取小组件显示层级失败，请稍后重试。'
  });

  safeIpcHandle('set-widget-window-mode', (event, widgetId, mode) => {
    const id = Number(widgetId);

    if (!Number.isInteger(id) || id <= 0) {
      throw new Error('小组件 ID 必须是正整数。');
    }
    if (!VALID_WINDOW_MODES.has(mode)) {
      throw new Error(`窗口模式无效：${String(mode)}`);
    }

    return widgetWindowService?.setWidgetWindowMode?.(id, mode);
  }, {
    message: '设置小组件显示层级失败，请稍后重试。'
  });

  safeIpcHandle('show-widget-window', (event, widgetId) => {
    const result = updateWidgetVisible(widgetId, true);

    if (result.widget) {
      widgetWindowService?.createWidgetWindow(result.widget);
    }

    return result;
  }, {
    message: '显示小组件失败，请稍后重试。'
  });

  safeIpcHandle('hide-widget-window', (event, widgetId) => {
    const result = updateWidgetVisible(widgetId, false);

    widgetWindowService?.closeWidgetWindow(widgetId);

    return result;
  }, {
    message: '隐藏小组件失败，请稍后重试。'
  });

  safeIpcHandle('open-widget-settings', (event, widgetId) => {
    return widgetWindowService?.showWidgetSettings?.(widgetId);
  }, {
    message: '打开小组件设置失败，请稍后重试。'
  });
}

module.exports = {
  registerWidgetIpc
};
