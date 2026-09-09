(function registerNotesWidget() {
  const FLUENT_ICON_ROOT = './assets/ui-icons/fluent';
  const DEFAULT_CATEGORIES = ['学习', '工作', '生活', '临时', '重要'];
  const NOTES_SIZE_PRESETS = {
    compact: { width: 340, height: 440 },
    comfortable: { width: 380, height: 500 }
  };
  const AUTOSAVE_DELAY_MS = 400;
  let widgetInstanceId = 0;
  let notes = [];
  let categories = [...DEFAULT_CATEGORIES];
  let activeQuery = '';
  let activeNoteId = null;
  let autosaveTimer = null;
  let saveQueue = Promise.resolve();
  let isCreating = false;
  let refreshVersion = 0;
  let globalEventController = null;

  const DwmUi = window.DwmUi;
  const escapeHtml = DwmUi.escapeHtml;

  function parseDatabaseDate(value) {
    if (!value) return null;
    const normalized = /Z$|[+-]\d{2}:?\d{2}$/.test(value)
      ? value
      : `${String(value).replace(' ', 'T')}Z`;
    const date = new Date(normalized);

    return Number.isNaN(date.getTime()) ? null : date;
  }

  function formatUpdatedAt(value) {
    const date = parseDatabaseDate(value);
    if (!date) return '';

    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const noteStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const differenceInDays = Math.round((todayStart.getTime() - noteStart.getTime()) / 86400000);
    const time = date.toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    });

    if (differenceInDays === 0) return time;
    if (differenceInDays === 1) return `昨天 ${time}`;

    return `${date.getMonth() + 1}月${date.getDate()}日 ${time}`;
  }

  function getCategoryClass(category) {
    return {
      学习: 'learning',
      工作: 'work',
      生活: 'life',
      重要: 'important',
      临时: 'temporary'
    }[category] || 'temporary';
  }

  function getNoteVisual(note) {
    const searchableText = `${note.title || ''} ${note.content || ''}`;
    const visualRules = [
      { pattern: /复习|计划/, icon: 'pin_20_filled.svg', tone: 'orange', layout: 'plan' },
      { pattern: /复制|文本/, icon: 'document_24_regular.svg', tone: 'blue', layout: 'document' },
      { pattern: /课堂|笔记|学习/, icon: 'book_open_24_regular.svg', tone: 'green', layout: 'study' },
      { pattern: /链接|网址|https?:\/\//i, icon: 'link_24_regular.svg', tone: 'purple', layout: 'link' },
      { pattern: /购物|清单/, icon: 'cart_24_regular.svg', tone: 'orange', layout: 'shopping' },
      { pattern: /待办|任务/, icon: 'checkbox_checked_24_regular.svg', tone: 'blue', layout: 'todo' }
    ];
    const matched = visualRules.find((rule) => rule.pattern.test(searchableText));

    return matched || { icon: 'note_24_regular.svg', tone: 'orange', layout: 'default' };
  }

  function setMessage(message, isError = false) {
    const element = document.querySelector('#notes-message');
    if (!element) return;

    element.textContent = message || '';
    element.classList.toggle('is-error', isError);
  }

  function getPreview(note) {
    return (note.content || '').replace(/\s+/g, ' ').trim() || '点击编辑便签内容';
  }

  function renderNoteList() {
    const list = document.querySelector('#notes-list');
    if (!list) return;

    if (!notes.length) {
      list.innerHTML = `
        <div class="notes-empty">
          <img src="./assets/widget-visuals/notes-object-transparent.png" alt="" />
          <strong>${activeQuery ? '没有找到匹配的便签' : '还没有便签'}</strong>
          <span>${activeQuery ? '换一个关键词试试。' : '记录下第一个想法吧。'}</span>
        </div>
      `;
      return;
    }

    list.innerHTML = notes.map((note) => {
      const visual = getNoteVisual(note);

      return `
      <article class="note-card note-layout-${visual.layout} ${note.isPinned ? 'is-pinned' : ''}" data-note-id="${note.id}" tabindex="0" aria-label="编辑便签：${escapeHtml(note.title)}">
        <span class="note-card-icon-wrap note-icon-${visual.tone}"><img class="note-card-icon" src="${FLUENT_ICON_ROOT}/${visual.icon}" alt="" /></span>
        <div class="note-card-copy">
          <strong>${escapeHtml(note.title)}</strong>
          <p>${escapeHtml(getPreview(note))}</p>
          <div class="note-card-meta">
            <span class="note-category note-category-${getCategoryClass(note.category)}">${escapeHtml(note.category)}</span>
            <time>${escapeHtml(formatUpdatedAt(note.updatedAt))}</time>
          </div>
        </div>
        <button class="note-pin-button ${note.isPinned ? 'is-active' : ''}" type="button" data-toggle-note-pin="${note.id}" aria-label="${note.isPinned ? '取消置顶' : '置顶便签'}" title="${note.isPinned ? '取消置顶' : '置顶便签'}">
          <img src="${FLUENT_ICON_ROOT}/${note.isPinned ? 'star_20_filled.svg' : 'pin_20_regular.svg'}" alt="" />
        </button>
        <button class="note-delete-button" type="button" data-delete-note="${note.id}" aria-label="删除便签" title="删除便签">
          <img src="./assets/ui-icons/figma-icon-09.svg" alt="" />
        </button>
      </article>
    `;
    }).join('');
  }

  async function loadNotes() {
    const version = ++refreshVersion;
    try {
      const result = activeQuery
        ? await window.api.searchNotes(widgetInstanceId, activeQuery)
        : await window.api.getNotes(widgetInstanceId);

      if (version !== refreshVersion) return notes;
      if (result?.success === false) {
        throw new Error(result.message || '读取便签失败。');
      }

      notes = Array.isArray(result) ? result : [];
      renderNoteList();
      return notes;
    } catch (error) {
      setMessage(error?.message || '读取便签失败。', true);
      return notes;
    }
  }

  function populateCategoryOptions(selectedCategory) {
    const select = document.querySelector('#note-editor-category');
    if (!select) return;

    const values = [...new Set([...categories, selectedCategory].filter(Boolean))];
    select.innerHTML = values.map((category) => (
      `<option value="${escapeHtml(category)}" ${category === selectedCategory ? 'selected' : ''}>${escapeHtml(category)}</option>`
    )).join('');
  }

  function openEditor(note) {
    const editor = document.querySelector('#note-editor');
    const titleInput = document.querySelector('#note-editor-title');
    const contentInput = document.querySelector('#note-editor-content');
    const pinnedInput = document.querySelector('#note-editor-pinned');
    const updatedLabel = document.querySelector('#note-editor-updated');
    if (!editor || !titleInput || !contentInput || !pinnedInput || !updatedLabel || !note) return;

    activeNoteId = Number(note.id);
    titleInput.value = note.title || '';
    contentInput.value = note.content || '';
    pinnedInput.checked = Boolean(note.isPinned);
    updatedLabel.textContent = `上次更新：${formatUpdatedAt(note.updatedAt)}`;
    populateCategoryOptions(note.category || '临时');
    editor.hidden = false;
    editor.setAttribute('aria-hidden', 'false');
    titleInput.focus();
  }

  async function flushAutosave() {
    if (!autosaveTimer) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = null;
    await saveActiveNote();
  }

  async function closeEditor() {
    await flushAutosave();
    const editor = document.querySelector('#note-editor');
    if (!editor) return;

    editor.hidden = true;
    editor.setAttribute('aria-hidden', 'true');
    activeNoteId = null;
  }

  function getEditorData() {
    return {
      title: document.querySelector('#note-editor-title').value,
      content: document.querySelector('#note-editor-content').value,
      category: document.querySelector('#note-editor-category').value,
      isPinned: document.querySelector('#note-editor-pinned').checked
    };
  }

  async function saveActiveNote() {
    if (!activeNoteId) return null;

    const noteId = activeNoteId;
    const noteData = getEditorData();
    saveQueue = saveQueue.then(async () => {
      const result = await window.api.updateNote(widgetInstanceId, noteId, noteData);

      if (result?.success === false) {
        throw new Error(result.message || '保存便签失败。');
      }

      const updatedLabel = document.querySelector('#note-editor-updated');
      if (updatedLabel && activeNoteId === noteId) {
        updatedLabel.textContent = '已自动保存';
      }
      setMessage('便签已自动保存。');
      await loadNotes();
      return result;
    }).catch((error) => {
      setMessage(error?.message || '自动保存失败。', true);
      return null;
    });

    return saveQueue;
  }

  function scheduleAutosave() {
    if (!activeNoteId) return;
    clearTimeout(autosaveTimer);
    autosaveTimer = window.setTimeout(() => {
      autosaveTimer = null;
      saveActiveNote();
    }, AUTOSAVE_DELAY_MS);
  }

  async function createBlankNote() {
    if (isCreating) return;
    isCreating = true;
    const button = document.querySelector('#notes-add-btn');
    if (button) button.disabled = true;

    try {
      const note = await window.api.createNote(widgetInstanceId, {
        title: '新便签',
        content: '',
        category: '临时',
        isPinned: false
      });

      if (note?.success === false) throw new Error(note.message || '新增便签失败。');
      await loadNotes();
      openEditor(note);
      setMessage('已创建新便签，输入后会自动保存。');
    } catch (error) {
      setMessage(error?.message || '新增便签失败。', true);
    } finally {
      isCreating = false;
      if (button) button.disabled = false;
    }
  }

  async function createQuickNote(event) {
    event.preventDefault();
    const input = document.querySelector('#notes-quick-input');
    const content = input.value.trim();

    if (!content) {
      setMessage('请输入便签内容。', true);
      input.focus();
      return;
    }

    const submitButton = document.querySelector('#notes-quick-submit');
    submitButton.disabled = true;
    try {
      const result = await window.api.createNote(widgetInstanceId, {
        content,
        category: '临时'
      });

      if (result?.success === false) throw new Error(result.message || '新增便签失败。');
      input.value = '';
      setMessage('便签已添加。');
      await loadNotes();
    } catch (error) {
      setMessage(error?.message || '新增便签失败。', true);
    } finally {
      submitButton.disabled = false;
    }
  }

  async function togglePinned(noteId) {
    const note = notes.find((item) => Number(item.id) === Number(noteId));
    if (!note) return;

    const result = await window.api.toggleNotePinned(widgetInstanceId, note.id, !note.isPinned);
    if (result?.success === false) {
      setMessage(result.message || '更新置顶状态失败。', true);
      return;
    }

    setMessage(note.isPinned ? '已取消置顶。' : '便签已置顶。');
    await loadNotes();
  }

  async function deleteNote(noteId) {
    const note = notes.find((item) => Number(item.id) === Number(noteId));
    if (!note) return;
    if (!window.confirm(`确认删除“${note.title}”吗？`)) return;

    const result = await window.api.deleteNote(widgetInstanceId, note.id);
    if (!result?.deleted) {
      setMessage(result?.message || '便签不存在或已被删除。', true);
      await loadNotes();
      return;
    }

    if (activeNoteId === note.id) {
      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      activeNoteId = null;
      document.querySelector('#note-editor').hidden = true;
    }
    setMessage('便签已删除。');
    await loadNotes();
  }

  function closeMoreMenu({ restoreFocus = false } = {}) {
    const menu = document.querySelector('#notes-more-menu');
    const button = document.querySelector('#notes-more-btn');
    if (!menu || !button || menu.hidden) return;

    DwmUi.hideMotionPanel(menu);
    button.setAttribute('aria-expanded', 'false');
    if (restoreFocus) button.focus();
  }

  async function readWidgetLayout() {
    try {
      const config = await window.api.getConfig();
      return window.DwmUi.getWidgetConfig(config?.widgets, widgetInstanceId);
    } catch (error) {
      return {};
    }
  }

  async function syncMoreMenuState() {
    const layout = await readWidgetLayout();
    const compactLabel = document.querySelector('#notes-compact-label');
    const pinLabel = document.querySelector('#notes-pin-label');
    const compact = Number(layout.width) === NOTES_SIZE_PRESETS.compact.width
      && Number(layout.height) === NOTES_SIZE_PRESETS.compact.height;
    const windowMode = window.DwmUi.isWindowMode(layout.windowMode)
      ? layout.windowMode
      : (layout.pinned === false ? 'normal' : 'desktop');

    if (compactLabel) compactLabel.textContent = compact ? '切换标准模式' : '切换紧凑模式';
    if (pinLabel) pinLabel.textContent = windowMode === 'desktop' ? '取消桌面固定' : '固定到桌面';
  }

  async function toggleMoreMenu() {
    const menu = document.querySelector('#notes-more-menu');
    const button = document.querySelector('#notes-more-btn');
    if (!menu || !button) return;

    if (!menu.hidden) {
      closeMoreMenu();
      return;
    }

    await syncMoreMenuState();
    DwmUi.showMotionPanel(menu);
    button.setAttribute('aria-expanded', 'true');
  }

  function openSearchPanel() {
    const panel = document.querySelector('#notes-search-panel');
    const searchButton = document.querySelector('#notes-search-btn');
    if (!panel || !searchButton) return;

    panel.hidden = false;
    searchButton.setAttribute('aria-expanded', 'true');
    document.querySelector('#notes-search-input')?.focus();
  }

  async function handleMoreMenuAction(event) {
    const button = event.target.closest('[data-notes-menu-action]');
    if (!button) return;

    const action = button.dataset.notesMenuAction;
    const layout = await readWidgetLayout();
    closeMoreMenu();

    if (action === 'new-note') {
      await createBlankNote();
      return;
    }
    if (action === 'search') {
      openSearchPanel();
      return;
    }
    if (action === 'toggle-compact') {
      const isCompact = Number(layout.width) === NOTES_SIZE_PRESETS.compact.width
        && Number(layout.height) === NOTES_SIZE_PRESETS.compact.height;
      const preset = isCompact ? NOTES_SIZE_PRESETS.comfortable : NOTES_SIZE_PRESETS.compact;
      await window.api.updateWidgetLayoutConfig(widgetInstanceId, preset);
      return;
    }
    if (action === 'toggle-desktop') {
      const windowMode = window.DwmUi.isWindowMode(layout.windowMode)
        ? layout.windowMode
        : (layout.pinned === false ? 'normal' : 'desktop');
      await window.api.setWidgetWindowMode(widgetInstanceId, windowMode === 'desktop' ? 'normal' : 'desktop');
      return;
    }
    if (action === 'reset') {
      await window.api.updateWidgetLayoutConfig(widgetInstanceId, {
        ...NOTES_SIZE_PRESETS.comfortable,
        opacity: 1,
        locked: false
      });
      await window.api.setWidgetWindowMode(widgetInstanceId, 'desktop');
      return;
    }
    if (action === 'hide') {
      await window.api.updateWidgetVisible(widgetInstanceId, false);
    }
  }

  window.NotesWidget = {
    label: '快速便签',
    render() {
      return `
        <section class="notes-widget video-scene" aria-label="快速便签小组件">
          <header class="notes-toolbar">
            <div class="notes-title-block">
              <span class="notes-title-icon"><img src="./assets/ui-icons/quick-notes-header.png" alt="" /></span>
              <h1>快速便签</h1>
            </div>
            <div class="notes-toolbar-actions">
              <button id="notes-add-btn" type="button" aria-label="新增便签" title="新增便签">
                <img src="${FLUENT_ICON_ROOT}/add_circle_20_filled.svg" alt="" />
              </button>
              <button id="notes-search-btn" type="button" aria-label="搜索便签" title="搜索便签" aria-expanded="false">
                <img src="${FLUENT_ICON_ROOT}/search_20_regular.svg" alt="" />
              </button>
              <button id="notes-more-btn" type="button" aria-label="更多操作" title="更多操作" aria-expanded="false" aria-controls="notes-more-menu">
                <img src="${FLUENT_ICON_ROOT}/more_horizontal_20_filled.svg" alt="" />
              </button>
            </div>
          </header>

          <nav id="notes-more-menu" class="notes-more-menu" role="menu" aria-label="快速便签操作" hidden>
            <button type="button" role="menuitem" data-notes-menu-action="new-note">
              <img src="${FLUENT_ICON_ROOT}/add_circle_20_filled.svg" alt="" /><span>新建便签</span>
            </button>
            <button type="button" role="menuitem" data-notes-menu-action="search">
              <img src="${FLUENT_ICON_ROOT}/search_20_regular.svg" alt="" /><span>搜索便签</span>
            </button>
            <span class="notes-menu-divider" aria-hidden="true"></span>
            <button type="button" role="menuitem" data-notes-menu-action="toggle-compact">
              <img src="${FLUENT_ICON_ROOT}/document_one_page_24_filled.svg" alt="" /><span id="notes-compact-label">切换紧凑模式</span>
            </button>
            <button type="button" role="menuitem" data-notes-menu-action="toggle-desktop">
              <img src="${FLUENT_ICON_ROOT}/pin_20_regular.svg" alt="" /><span id="notes-pin-label">固定到桌面</span>
            </button>
            <button type="button" role="menuitem" data-notes-menu-action="reset">
              <img src="${FLUENT_ICON_ROOT}/notepad_24_filled.svg" alt="" /><span>恢复默认布局</span>
            </button>
            <span class="notes-menu-divider" aria-hidden="true"></span>
            <button type="button" role="menuitem" class="is-danger" data-notes-menu-action="hide">
              <img src="${FLUENT_ICON_ROOT}/dismiss_20_regular.svg" alt="" /><span>隐藏组件</span>
            </button>
          </nav>

          <div id="notes-search-panel" class="notes-search-panel" hidden>
            <input id="notes-search-input" type="search" maxlength="200" placeholder="搜索标题、正文或分类" autocomplete="off" />
            <button id="notes-search-close" type="button" aria-label="关闭搜索">
              <img src="${FLUENT_ICON_ROOT}/dismiss_20_regular.svg" alt="" />
            </button>
          </div>

          <p id="notes-message" class="notes-message" aria-live="polite"></p>
          <div id="notes-list" class="notes-list" aria-live="polite"></div>

          <aside id="note-editor" class="note-editor" hidden aria-hidden="true" aria-label="编辑便签">
            <div class="note-editor-head">
              <strong>编辑便签</strong>
              <button id="note-editor-close" type="button" aria-label="关闭编辑器">
                <img src="${FLUENT_ICON_ROOT}/dismiss_20_regular.svg" alt="" />
              </button>
            </div>
            <input id="note-editor-title" type="text" maxlength="120" placeholder="便签标题" />
            <textarea id="note-editor-content" maxlength="5000" placeholder="写下正文内容…"></textarea>
            <div class="note-editor-controls">
              <select id="note-editor-category" aria-label="便签分类"></select>
              <label><input id="note-editor-pinned" type="checkbox" /><span>置顶</span></label>
              <span id="note-editor-updated">已自动保存</span>
            </div>
          </aside>

          <form id="notes-quick-form" class="notes-quick-form">
            <img src="${FLUENT_ICON_ROOT}/attach_24_regular.svg" alt="" />
            <input id="notes-quick-input" type="text" maxlength="1000" placeholder="新建便签，快速记录…" autocomplete="off" />
            <button id="notes-quick-submit" type="submit" aria-label="发送便签" title="发送便签"><img src="${FLUENT_ICON_ROOT}/send_24_regular.svg" alt="" /></button>
          </form>
        </section>
      `;
    },
    async mount(params) {
      widgetInstanceId = Number(params.id);
      if (!Number.isInteger(widgetInstanceId) || widgetInstanceId <= 0) {
        setMessage('小组件实例无效，无法加载便签。', true);
        return;
      }

      try {
        const categoryResult = await window.api.getNoteCategories();
        if (Array.isArray(categoryResult) && categoryResult.length) {
          categories = categoryResult;
        }
      } catch (error) {
        categories = [...DEFAULT_CATEGORIES];
      }

      document.querySelector('#notes-add-btn').addEventListener('click', createBlankNote);
      document.querySelector('#notes-quick-form').addEventListener('submit', createQuickNote);
      document.querySelector('#notes-more-btn').addEventListener('click', toggleMoreMenu);
      document.querySelector('#notes-more-menu').addEventListener('click', handleMoreMenuAction);
      document.querySelector('#notes-search-btn').addEventListener('click', () => {
        const panel = document.querySelector('#notes-search-panel');
        panel.hidden = !panel.hidden;
        document.querySelector('#notes-search-btn').setAttribute('aria-expanded', String(!panel.hidden));
        if (!panel.hidden) document.querySelector('#notes-search-input').focus();
      });
      document.querySelector('#notes-search-close').addEventListener('click', async () => {
        activeQuery = '';
        document.querySelector('#notes-search-input').value = '';
        document.querySelector('#notes-search-panel').hidden = true;
        document.querySelector('#notes-search-btn').setAttribute('aria-expanded', 'false');
        await loadNotes();
      });
      document.querySelector('#notes-search-input').addEventListener('input', async (event) => {
        activeQuery = event.target.value.trim();
        await loadNotes();
      });
      document.querySelector('#notes-list').addEventListener('click', async (event) => {
        const pinButton = event.target.closest('[data-toggle-note-pin]');
        const deleteButton = event.target.closest('[data-delete-note]');
        const card = event.target.closest('[data-note-id]');

        if (pinButton) {
          await togglePinned(Number(pinButton.dataset.toggleNotePin));
          return;
        }
        if (deleteButton) {
          await deleteNote(Number(deleteButton.dataset.deleteNote));
          return;
        }
        if (card) {
          openEditor(notes.find((note) => Number(note.id) === Number(card.dataset.noteId)));
        }
      });
      document.querySelector('#notes-list').addEventListener('keydown', (event) => {
        const card = event.target.closest('[data-note-id]');
        if (card && (event.key === 'Enter' || event.key === ' ')) {
          event.preventDefault();
          openEditor(notes.find((note) => Number(note.id) === Number(card.dataset.noteId)));
        }
      });
      ['#note-editor-title', '#note-editor-content'].forEach((selector) => {
        document.querySelector(selector).addEventListener('input', scheduleAutosave);
      });
      ['#note-editor-category', '#note-editor-pinned'].forEach((selector) => {
        document.querySelector(selector).addEventListener('change', scheduleAutosave);
      });
      document.querySelector('#note-editor-close').addEventListener('click', closeEditor);
      globalEventController?.abort();
      globalEventController = new AbortController();
      const globalEventOptions = { signal: globalEventController.signal };
      document.addEventListener('pointerdown', (event) => {
        if (!event.target.closest('#notes-more-menu, #notes-more-btn')) closeMoreMenu();
      }, { capture: true, ...globalEventOptions });
      document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') closeMoreMenu({ restoreFocus: true });
      }, globalEventOptions);
      window.addEventListener('notes-data-changed', (event) => {
        if (Number(event.detail?.widgetInstanceId) === widgetInstanceId) {
          loadNotes();
        }
      }, globalEventOptions);

      await loadNotes();
    },
    async unmount() {
      globalEventController?.abort();
      globalEventController = null;
      if (!autosaveTimer) {
        return;
      }

      clearTimeout(autosaveTimer);
      autosaveTimer = null;
      await saveActiveNote();
    }
  };
}());
