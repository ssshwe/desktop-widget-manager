const { safeIpcHandle } = require('./safeIpc');
const {
  createNote,
  deleteNote,
  getNoteCategories,
  getNotes,
  searchNotes,
  toggleNotePinned,
  updateNote
} = require('../services/noteService');

function notifyNotes(widgetRuntimeService, widgetInstanceId, source) {
  widgetRuntimeService?.broadcastWidgetEvent?.('notes-data-changed', {
    widgetInstanceId: Number(widgetInstanceId),
    source,
    changedAt: new Date().toISOString()
  }, ['notes']);
}

function registerNoteIpc(widgetRuntimeService = {}) {
  safeIpcHandle('notes:get', (event, widgetInstanceId) => getNotes(widgetInstanceId), {
    message: '读取便签失败，请稍后重试。',
    fallbackValue: []
  });

  safeIpcHandle('notes:search', (event, widgetInstanceId, query) => (
    searchNotes(widgetInstanceId, query)
  ), {
    message: '搜索便签失败，请稍后重试。',
    fallbackValue: []
  });

  safeIpcHandle('notes:categories', () => getNoteCategories(), {
    message: '读取便签分类失败，请稍后重试。',
    fallbackValue: ['学习', '工作', '生活', '临时', '重要']
  });

  safeIpcHandle('notes:create', (event, widgetInstanceId, noteData) => {
    const note = createNote(widgetInstanceId, noteData);

    notifyNotes(widgetRuntimeService, widgetInstanceId, 'create');
    return note;
  }, {
    message: '新增便签失败，请检查内容后重试。'
  });

  safeIpcHandle('notes:update', (event, widgetInstanceId, noteId, noteData) => {
    const note = updateNote(widgetInstanceId, noteId, noteData);

    notifyNotes(widgetRuntimeService, widgetInstanceId, 'update');
    return note;
  }, {
    message: '保存便签失败，请稍后重试。'
  });

  safeIpcHandle('notes:toggle-pinned', (event, widgetInstanceId, noteId, pinned) => {
    const note = toggleNotePinned(widgetInstanceId, noteId, pinned);

    notifyNotes(widgetRuntimeService, widgetInstanceId, 'pin');
    return note;
  }, {
    message: '更新置顶状态失败，请稍后重试。'
  });

  safeIpcHandle('notes:delete', (event, widgetInstanceId, noteId) => {
    const result = deleteNote(widgetInstanceId, noteId);

    if (result.deleted) {
      notifyNotes(widgetRuntimeService, widgetInstanceId, 'delete');
    }

    return result;
  }, {
    message: '删除便签失败，请稍后重试。',
    fallback: (error, message, event, widgetInstanceId, noteId) => ({
      id: Number(noteId),
      widgetInstanceId: Number(widgetInstanceId),
      deleted: false,
      success: false,
      message
    })
  });
}

module.exports = {
  registerNoteIpc
};
