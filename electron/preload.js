const { contextBridge, ipcRenderer, webUtils } = require('electron');

function toDiagnosticPayload(source, event) {
  const reason = event?.reason || event?.error;
  const message = reason?.message || event?.message || String(reason || '未知错误');
  const stack = reason?.stack || '';

  return {
    source,
    level: 'error',
    message: String(message).slice(0, 2000),
    stack: String(stack).slice(0, 8000)
  };
}

// The sandboxed preload observes otherwise invisible renderer failures and
// forwards a bounded diagnostic payload to the local main-process log.
window.addEventListener('error', (event) => {
  ipcRenderer.send('renderer-diagnostic', toDiagnosticPayload('error', event));
});
window.addEventListener('unhandledrejection', (event) => {
  ipcRenderer.send('renderer-diagnostic', toDiagnosticPayload('unhandledrejection', event));
});

// 预加载脚本用于在安全隔离环境中向页面暴露必要信息。
contextBridge.exposeInMainWorld('desktopWidgetManager', {
  appName: '桌面小组件管理工具',
  version: '0.1.0'
});

contextBridge.exposeInMainWorld('windowControls', {
  minimize: () => ipcRenderer.send('manager-window-control', 'minimize'),
  toggleMaximize: () => ipcRenderer.send('manager-window-control', 'toggle-maximize'),
  close: () => ipcRenderer.send('manager-window-control', 'close')
});

// 只暴露明确允许的安全 API，渲染进程不能直接使用 fs、path 或数据库能力。
contextBridge.exposeInMainWorld('api', {
  getConfig: () => ipcRenderer.invoke('get-config'),
  updateConfig: (newConfig) => ipcRenderer.invoke('update-config', newConfig),
  getAutoStartSettings: () => ipcRenderer.invoke('get-auto-start-settings'),
  updateAutoStartSettings: (enabled) => ipcRenderer.invoke('update-auto-start-settings', enabled),
  getWidgetList: () => ipcRenderer.invoke('get-widget-list'),
  createWidget: (widgetData) => ipcRenderer.invoke('create-widget', widgetData),
  updateWidget: (widgetId, widgetData) => ipcRenderer.invoke('update-widget', widgetId, widgetData),
  deleteWidget: (widgetId) => ipcRenderer.invoke('delete-widget', widgetId),
  updateWidgetVisible: (widgetId, visible) => ipcRenderer.invoke('update-widget-visible', widgetId, visible),
  updateWidgetLayoutConfig: (widgetId, layoutConfig) => (
    ipcRenderer.invoke('update-widget-layout-config', widgetId, layoutConfig)
  ),
  getWidgetWindowMode: (widgetId) => ipcRenderer.invoke('get-widget-window-mode', widgetId),
  setWidgetWindowMode: (widgetId, mode) => (
    ipcRenderer.invoke('set-widget-window-mode', widgetId, mode)
  ),
  openWidgetSettings: (widgetId) => ipcRenderer.invoke('open-widget-settings', widgetId),
  getTodoList: () => ipcRenderer.invoke('get-todo-list'),
  createTodo: (todoData) => ipcRenderer.invoke('create-todo', todoData),
  updateTodo: (todoId, todoData) => ipcRenderer.invoke('update-todo', todoId, todoData),
  deleteTodo: (todoId) => ipcRenderer.invoke('delete-todo', todoId),
  updateTodoCompleted: (todoId, completed) => ipcRenderer.invoke('update-todo-completed', todoId, completed),
  getNotes: (widgetInstanceId) => ipcRenderer.invoke('notes:get', widgetInstanceId),
  searchNotes: (widgetInstanceId, query) => ipcRenderer.invoke('notes:search', widgetInstanceId, query),
  getNoteCategories: () => ipcRenderer.invoke('notes:categories'),
  createNote: (widgetInstanceId, noteData) => (
    ipcRenderer.invoke('notes:create', widgetInstanceId, noteData)
  ),
  updateNote: (widgetInstanceId, noteId, noteData) => (
    ipcRenderer.invoke('notes:update', widgetInstanceId, noteId, noteData)
  ),
  deleteNote: (widgetInstanceId, noteId) => (
    ipcRenderer.invoke('notes:delete', widgetInstanceId, noteId)
  ),
  toggleNotePinned: (widgetInstanceId, noteId, pinned) => (
    ipcRenderer.invoke('notes:toggle-pinned', widgetInstanceId, noteId, pinned)
  ),
  getScheduleList: () => ipcRenderer.invoke('get-schedule-list'),
  getTodayScheduleList: () => ipcRenderer.invoke('get-today-schedule-list'),
  createSchedule: (scheduleData) => ipcRenderer.invoke('create-schedule', scheduleData),
  updateSchedule: (scheduleId, scheduleData) => ipcRenderer.invoke('update-schedule', scheduleId, scheduleData),
  deleteSchedule: (scheduleId) => ipcRenderer.invoke('delete-schedule', scheduleId),
  getWeatherSettings: () => ipcRenderer.invoke('get-weather-settings'),
  updateWeatherCity: (city) => ipcRenderer.invoke('update-weather-city', city),
  refreshWeather: (city, options) => ipcRenderer.invoke('refresh-weather', city, options),
  getDesktopFiles: () => ipcRenderer.invoke('get-desktop-files'),
  scanDesktopFiles: () => ipcRenderer.invoke('scan-desktop-files'),
  previewDesktopOrganization: () => ipcRenderer.invoke('preview-desktop-organization'),
  organizeDesktopFiles: (options) => ipcRenderer.invoke('organize-desktop-files', options),
  chooseFloatingFolderItems: () => ipcRenderer.invoke('choose-floating-folder-items'),
  resolveFloatingFolderFiles: (filePaths) => ipcRenderer.invoke('resolve-floating-folder-files', filePaths),
  getPathForFile: (file) => {
    try {
      return webUtils.getPathForFile(file);
    } catch (error) {
      return '';
    }
  },
  openFloatingFolderFile: (widgetId, filePath) => (
    ipcRenderer.invoke('open-floating-folder-file', widgetId, filePath)
  )
});
