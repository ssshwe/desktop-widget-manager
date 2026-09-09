(function registerFloatingFolderWidget() {
  const SIZE_PRESETS = {
    compact: { label: '紧凑', width: 260, height: 180, iconSize: 38, gap: 5 },
    comfortable: { label: '舒适', width: 340, height: 300, iconSize: 46, gap: 8 },
    large: { label: '大尺寸', width: 420, height: 420, iconSize: 54, gap: 12 }
  };
  const DEFAULT_ZONES = [
    { id: 'home', name: '主页', custom: false },
    { id: 'develop', name: '开发', custom: false },
    { id: 'entertainment', name: '娱乐', custom: false },
    { id: 'office', name: '办公', custom: false }
  ];
  const EXTENSION_ICON_MAP = {
    exe: './assets/floating-folder/app-icons/browser.svg',
    lnk: './assets/floating-folder/app-icons/browser.svg',
    app: './assets/floating-folder/app-icons/browser.svg',
    js: './assets/floating-folder/app-icons/vscode.svg',
    json: './assets/floating-folder/app-icons/vscode.svg',
    html: './assets/floating-folder/app-icons/vscode.svg',
    css: './assets/floating-folder/app-icons/vscode.svg',
    md: './assets/floating-folder/app-icons/vscode.svg',
    py: './assets/floating-folder/app-icons/pycharm.svg',
    doc: './assets/floating-folder/app-icons/wps.svg',
    docx: './assets/floating-folder/app-icons/wps.svg',
    xls: './assets/floating-folder/app-icons/office.svg',
    xlsx: './assets/floating-folder/app-icons/office.svg',
    ppt: './assets/floating-folder/app-icons/office.svg',
    pptx: './assets/floating-folder/app-icons/office.svg',
    mp3: './assets/floating-folder/app-icons/music.svg',
    wav: './assets/floating-folder/app-icons/music.svg',
    mp4: './assets/floating-folder/app-icons/video.ico',
    mov: './assets/floating-folder/app-icons/video.ico'
  };
  const DEFAULT_ZONE_ICON_MAP = {
    home: './assets/floating-folder/nav-icons/home.svg',
    develop: './assets/floating-folder/nav-icons/code.svg',
    entertainment: './assets/floating-folder/nav-icons/games.svg',
    office: './assets/floating-folder/nav-icons/briefcase.svg'
  };
  const ZONE_ICON_OPTIONS = [
    { key: 'home', label: '主页', src: DEFAULT_ZONE_ICON_MAP.home },
    { key: 'develop', label: '开发', src: DEFAULT_ZONE_ICON_MAP.develop },
    { key: 'entertainment', label: '娱乐', src: DEFAULT_ZONE_ICON_MAP.entertainment },
    { key: 'office', label: '办公', src: DEFAULT_ZONE_ICON_MAP.office },
    { key: 'star', label: '收藏', src: './assets/floating-folder/nav-icons/star.svg' },
    { key: 'idea', label: '灵感', src: './assets/floating-folder/nav-icons/idea.svg' },
    { key: 'study', label: '学习', src: './assets/floating-folder/nav-icons/study.svg' },
    { key: 'camera', label: '摄影', src: './assets/floating-folder/nav-icons/camera.svg' },
    { key: 'shopping', label: '购物', src: './assets/floating-folder/nav-icons/shopping.svg' },
    { key: 'travel', label: '旅行', src: './assets/floating-folder/nav-icons/travel.svg' },
    { key: 'life', label: '生活', src: './assets/floating-folder/nav-icons/life.svg' },
    { key: 'projects', label: '项目', src: './assets/floating-folder/nav-icons/projects.svg' }
  ];
  const ZONE_ICON_OPTION_MAP = Object.fromEntries(ZONE_ICON_OPTIONS.map((item) => [item.key, item]));

  let latestFiles = [];
  let currentWidgetId = null;
  let sourceWidgetId = null;
  let currentWidgetName = '快捷收纳区';
  let currentConfig = {};
  let latestPayload = null;
  let activeZoneId = 'home';
  let detachedZoneId = null;
  let selectedFilePath = '';
  let draggedIndex = null;
  let iconPointer = null;
  let zonePointer = null;
  let iconDragOccurred = false;
  let zoneDragOccurred = false;
  let toastTimer = null;
  let visualConfigPersistTimer = null;
  let externalDragDepth = 0;
  let globalEventController = null;

  const DwmUi = window.DwmUi;
  const escapeHtml = DwmUi.escapeHtml;

  function animateFileGrid(grid) {
    const items = grid?.querySelectorAll('.ff-app-item');

    if (!items?.length) return;
    DwmUi.runMotion(
      items,
      {
        opacity: [0, 1],
        y: [10, 0],
        scale: [0.92, 1]
      },
      {
        type: 'spring',
        visualDuration: 0.3,
        bounce: 0.17,
        delay: DwmUi.getMotionStagger(0.04, { from: 'first' })
      }
    );
  }

  function getRefs() {
    return {
      root: document.querySelector('.floating-folder-widget'),
      title: document.querySelector('#floating-folder-title'),
      count: document.querySelector('#floating-folder-count'),
      tabs: document.querySelector('#floating-folder-zone-tabs'),
      grid: document.querySelector('#floating-folder-grid'),
      empty: document.querySelector('#floating-folder-empty'),
      hint: document.querySelector('#floating-folder-hint'),
      message: document.querySelector('#floating-folder-message'),
      pinButton: document.querySelector('#floating-folder-pin-btn'),
      settingsButton: document.querySelector('#floating-folder-settings-btn'),
      settingsPanel: document.querySelector('#floating-folder-settings-panel'),
      moreButton: document.querySelector('#floating-folder-more-btn'),
      moreMenu: document.querySelector('#floating-folder-more-menu'),
      zoneForm: document.querySelector('#floating-folder-zone-form'),
      zoneName: document.querySelector('#floating-folder-zone-name'),
      zoneIcon: document.querySelector('#floating-folder-zone-icon'),
      zoneManager: document.querySelector('#floating-folder-zone-manager'),
      zoneManagerList: document.querySelector('#floating-folder-zone-manager-list'),
      compactLabel: document.querySelector('#floating-folder-compact-label'),
      iconSizeInput: document.querySelector('#floating-folder-icon-size'),
      iconSizeOutput: document.querySelector('#floating-folder-icon-size-output'),
      iconGapInput: document.querySelector('#floating-folder-icon-gap'),
      iconGapOutput: document.querySelector('#floating-folder-icon-gap-output'),
      opacityInput: document.querySelector('#floating-folder-opacity'),
      opacityOutput: document.querySelector('#floating-folder-opacity-output'),
      labelsInput: document.querySelector('#floating-folder-show-labels'),
      hintInput: document.querySelector('#floating-folder-show-hint'),
      fileMenu: document.querySelector('#floating-folder-file-menu'),
      toast: document.querySelector('#floating-folder-toast')
    };
  }

  function svgIcon(symbolId, className = 'ff-ui-icon') {
    return `<svg class="${className}" aria-hidden="true"><use href="#${symbolId}"></use></svg>`;
  }

  function getZoneIconOption(iconKey) {
    return ZONE_ICON_OPTION_MAP[iconKey] || ZONE_ICON_OPTIONS[0];
  }

  function renderZoneIcon(zone, className = 'ff-zone-icon') {
    const defaultIcon = DEFAULT_ZONE_ICON_MAP[zone.id];
    const icon = getZoneIconOption(zone.iconKey);
    return `<img class="${className}" src="${defaultIcon || icon.src}" alt="" />`;
  }

  function renderZoneIconOptions() {
    return ZONE_ICON_OPTIONS.map((icon) => `
      <button
        class="ff-zone-icon-option"
        type="button"
        data-zone-icon="${icon.key}"
        aria-label="${icon.label}"
        aria-pressed="false"
        title="${icon.label}"
      >
        <img class="ff-zone-picker-art" src="${icon.src}" alt="" />
      </button>
    `).join('');
  }

  function setZoneIconSelection(iconKey) {
    const refs = getRefs();
    const selected = getZoneIconOption(iconKey).key;
    if (refs.zoneIcon) refs.zoneIcon.value = selected;
    refs.zoneForm?.querySelectorAll('[data-zone-icon]').forEach((button) => {
      const active = button.dataset.zoneIcon === selected;
      button.classList.toggle('is-selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  function getSizeFromConfig() {
    const width = Number(currentConfig.width);
    const height = Number(currentConfig.height);

    if (width <= 270 || height <= 200) return 'compact';
    if (width <= 360 || height <= 330) return 'comfortable';
    return 'large';
  }

  function normalizeFolderConfig(config = {}) {
    const folderConfig = config.floatingFolder && typeof config.floatingFolder === 'object'
      ? config.floatingFolder
      : {};
    const zones = Array.isArray(folderConfig.zones)
      ? folderConfig.zones
      : DEFAULT_ZONES;

    return {
      zones: zones.map((zone) => ({
        id: String(zone.id || `zone-${Date.now()}`),
        name: String(zone.name || '分区').slice(0, 8),
        custom: Boolean(zone.custom),
        iconKey: ZONE_ICON_OPTION_MAP[zone.iconKey] ? zone.iconKey : (zone.custom ? 'star' : '')
      })),
      zoneOrders: folderConfig.zoneOrders && typeof folderConfig.zoneOrders === 'object'
        ? folderConfig.zoneOrders
        : {},
      activeZoneId: folderConfig.activeZoneId || 'home',
      iconSize: Number(folderConfig.iconSize) || SIZE_PRESETS[getSizeFromConfig()].iconSize,
      iconGap: Number(folderConfig.iconGap) || SIZE_PRESETS[getSizeFromConfig()].gap,
      showLabels: folderConfig.showLabels !== false,
      showHint: folderConfig.showHint !== false,
      addedFilePaths: Array.isArray(folderConfig.addedFilePaths)
        ? [...new Set(folderConfig.addedFilePaths.filter((filePath) => typeof filePath === 'string' && filePath))]
        : [],
      removedFilePaths: Array.isArray(folderConfig.removedFilePaths)
        ? [...new Set(folderConfig.removedFilePaths.filter((filePath) => typeof filePath === 'string' && filePath))]
        : []
    };
  }

  async function readWidgetConfig(widgetId) {
    if (!window.api?.getConfig || !Number.isInteger(Number(widgetId))) return {};
    const config = await window.api.getConfig();
    return window.DwmUi.getWidgetConfig(config.widgets, widgetId);
  }

  async function loadRuntimeConfig(params) {
    currentWidgetId = Number(params.id);
    currentWidgetName = params.name || '快捷收纳区';
    const ownConfig = await readWidgetConfig(currentWidgetId);
    sourceWidgetId = Number(ownConfig.floatingFolderSourceWidgetId) || currentWidgetId;
    detachedZoneId = ownConfig.floatingFolderDetachedZoneId || null;

    if (sourceWidgetId !== currentWidgetId) {
      const sourceConfig = await readWidgetConfig(sourceWidgetId);
      currentConfig = {
        ...sourceConfig,
        width: ownConfig.width,
        height: ownConfig.height,
        opacity: ownConfig.opacity,
        windowMode: ownConfig.windowMode,
        pinned: ownConfig.pinned,
        locked: ownConfig.locked,
        floatingFolderSourceWidgetId: ownConfig.floatingFolderSourceWidgetId,
        floatingFolderDetachedZoneId: ownConfig.floatingFolderDetachedZoneId
      };
    } else {
      currentConfig = ownConfig;
    }

    const folderConfig = normalizeFolderConfig(currentConfig);
    activeZoneId = detachedZoneId || folderConfig.activeZoneId || 'home';
  }

  async function persistFolderConfig(partial = {}) {
    const targetWidgetId = sourceWidgetId || currentWidgetId;
    const base = normalizeFolderConfig(currentConfig);
    const nextFolderConfig = {
      ...base,
      ...partial
    };
    const nextConfig = {
      floatingFolder: nextFolderConfig
    };

    currentConfig = {
      ...currentConfig,
      floatingFolder: nextFolderConfig
    };

    if (window.api?.updateWidgetLayoutConfig && Number.isInteger(Number(targetWidgetId))) {
      await window.api.updateWidgetLayoutConfig(Number(targetWidgetId), nextConfig);
    }
  }

  function updateFolderVisualPreference(key, value) {
    const folderConfig = normalizeFolderConfig(currentConfig);
    folderConfig[key] = Number(value);
    currentConfig = {
      ...currentConfig,
      floatingFolder: folderConfig
    };

    // 先重绘再持久化，拖动滑块时图标和网格会跟随鼠标即时变化。
    applyVisualConfig();
    window.clearTimeout(visualConfigPersistTimer);
    visualConfigPersistTimer = window.setTimeout(() => {
      visualConfigPersistTimer = null;
      persistFolderConfig(normalizeFolderConfig(currentConfig)).catch(() => {
        showToast('设置保存失败，请重试');
      });
    }, 120);
  }

  function getActiveZone() {
    const folderConfig = normalizeFolderConfig(currentConfig);
    return folderConfig.zones.find((zone) => zone.id === activeZoneId) || folderConfig.zones[0];
  }

  function getFileKey(file) {
    return file?.filePath || file?.name || '';
  }

  function normalizeFileKey(filePath) {
    return String(filePath || '').replaceAll('/', '\\').toLocaleLowerCase('en-US');
  }

  function isSameFilePath(leftPath, rightPath) {
    return normalizeFileKey(leftPath) === normalizeFileKey(rightPath);
  }

  function getAllAssignedKeys(folderConfig) {
    return new Set(Object.values(folderConfig.zoneOrders || {}).flat());
  }

  function getFilesForZone(zoneId) {
    const folderConfig = normalizeFolderConfig(currentConfig);
    const fileMap = new Map(latestFiles.map((file) => [getFileKey(file), file]));
    const orderedKeys = Array.isArray(folderConfig.zoneOrders[zoneId]) ? folderConfig.zoneOrders[zoneId] : [];
    const orderedFiles = orderedKeys.map((key) => fileMap.get(key)).filter(Boolean);

    if (zoneId !== 'home') {
      return orderedFiles;
    }

    const assigned = getAllAssignedKeys(folderConfig);
    const unassigned = latestFiles.filter((file) => !assigned.has(getFileKey(file)));
    return [...orderedFiles, ...unassigned];
  }

  function getFileExtension(file) {
    const name = file?.name || '';
    const extension = name.includes('.') ? name.split('.').pop().toLowerCase() : '';
    return extension || '';
  }

  function getFileIcon(file) {
    if (file?.isDirectory || file?.type === '文件夹') return { symbol: 'ff-folder', color: '#e7a22a' };
    const extension = getFileExtension(file);
    if (EXTENSION_ICON_MAP[extension]) return { asset: EXTENSION_ICON_MAP[extension], color: '#1973da' };
    if (extension === 'pdf') return { symbol: 'ff-pdf', color: '#d64d50' };
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(extension)) return { symbol: 'ff-image', color: '#e97236' };
    if (['zip', 'rar', '7z'].includes(extension)) return { symbol: 'ff-cube', color: '#2d8d6f' };
    return { symbol: 'ff-file', color: '#5c8fc5' };
  }

  function renderFileVisual(file) {
    if (file?.iconDataUrl) {
      return `
        <span class="ff-app-icon-shell">
          <img class="ff-app-brand-icon" src="${escapeHtml(file.iconDataUrl)}" alt="" />
          ${svgIcon('ff-file', 'ff-ui-icon ff-fallback-icon')}
        </span>
      `;
    }

    const icon = getFileIcon(file);
    if (icon.asset) {
      return `
        <span class="ff-app-icon-shell" style="--icon-color:${icon.color}">
          <img class="ff-app-brand-icon" src="${escapeHtml(icon.asset)}" alt="" loading="lazy" />
          ${svgIcon('ff-file', 'ff-ui-icon ff-fallback-icon')}
        </span>
      `;
    }

    return `
      <span class="ff-app-icon-shell" style="--icon-color:${icon.color}">
        ${svgIcon(icon.symbol)}
      </span>
    `;
  }

  function showMessage(message) {
    const refs = getRefs();
    if (refs.message) refs.message.textContent = message || '';
  }

  function showToast(message) {
    const refs = getRefs();
    if (!refs.toast) return;
    refs.toast.textContent = message;
    refs.toast.classList.add('is-visible');
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => refs.toast.classList.remove('is-visible'), 1800);
  }

  function closeFileContextMenu() {
    const menu = getRefs().fileMenu;
    if (menu) {
      DwmUi.hideMotionPanel(menu);
      menu.removeAttribute('data-file-path');
    }
  }

  function openFileContextMenu(file, x, y) {
    const menu = getRefs().fileMenu;
    if (!menu || !file) return;
    selectedFilePath = getFileKey(file);
    renderFiles();
    menu.dataset.filePath = selectedFilePath;
    DwmUi.showMotionPanel(menu);
    const margin = 8;
    menu.style.left = `${Math.max(margin, Math.min(Number(x) || margin, window.innerWidth - menu.offsetWidth - margin))}px`;
    menu.style.top = `${Math.max(margin, Math.min(Number(y) || margin, window.innerHeight - menu.offsetHeight - margin))}px`;
  }

  async function removeFileFromCollection(filePath) {
    if (!filePath) return;
    const folderConfig = normalizeFolderConfig(currentConfig);
    folderConfig.addedFilePaths = folderConfig.addedFilePaths.filter((itemPath) => !isSameFilePath(itemPath, filePath));
    folderConfig.removedFilePaths = [
      ...folderConfig.removedFilePaths.filter((itemPath) => !isSameFilePath(itemPath, filePath)),
      filePath
    ];
    Object.keys(folderConfig.zoneOrders).forEach((zoneId) => {
      folderConfig.zoneOrders[zoneId] = folderConfig.zoneOrders[zoneId].filter((key) => !isSameFilePath(key, filePath));
    });
    selectedFilePath = '';
    await persistFolderConfig(folderConfig);
    latestFiles = latestFiles.filter((file) => !isSameFilePath(getFileKey(file), filePath));
    latestPayload = {
      ...(latestPayload || {}),
      files: latestFiles
    };
    renderShell(latestPayload);
    closeFileContextMenu();
    showToast('已从收纳区移除，原文件仍保留');
  }

  function renderTabs() {
    const refs = getRefs();
    const folderConfig = normalizeFolderConfig(currentConfig);
    if (!refs.tabs) return;

    if (detachedZoneId) {
      refs.tabs.replaceChildren();
      refs.tabs.hidden = true;
      return;
    }

    refs.tabs.hidden = false;
    refs.tabs.innerHTML = folderConfig.zones.map((zone) => `
      <button
        class="ff-zone-tab${zone.id === activeZoneId ? ' is-active' : ''}"
        type="button"
        data-category-id="${escapeHtml(zone.id)}"
        aria-pressed="${zone.id === activeZoneId ? 'true' : 'false'}"
        title="拖动到桌面可创建独立收纳区"
      >
        ${renderZoneIcon(zone)}
        <span>${escapeHtml(zone.name)}</span>
      </button>
    `).join('') + `
      <button class="ff-zone-tab ff-zone-tab--add" type="button" data-action="new-zone">
        ${svgIcon('ff-plus')}
        <span>新建分区</span>
      </button>
    `;
  }

  function renderFiles({ animate = false } = {}) {
    const refs = getRefs();
    const files = getFilesForZone(activeZoneId);
    const zone = getActiveZone();
    if (!refs.grid || !refs.empty) return;

    refs.empty.hidden = files.length > 0;
    refs.grid.hidden = files.length === 0;
    refs.grid.innerHTML = files.map((file, index) => {
      const key = getFileKey(file);
      return `
        <button
          class="ff-app-item${selectedFilePath === key ? ' is-selected' : ''}"
          type="button"
          data-file-index="${index}"
          data-file-path="${escapeHtml(key)}"
          aria-label="${escapeHtml(file.name)}"
        >
          ${renderFileVisual(file)}
          <span class="ff-app-label">${escapeHtml(file.name)}</span>
        </button>
      `;
    }).join('');
    refs.grid.querySelectorAll('.ff-app-brand-icon').forEach((image) => {
      image.addEventListener('error', () => image.removeAttribute('src'), { once: true });
    });
    if (animate) animateFileGrid(refs.grid);

    const emptyTitle = refs.empty.querySelector('strong');
    const emptyCopy = refs.empty.querySelector('span');
    if (emptyTitle) {
      emptyTitle.textContent = zone?.id === 'home'
        ? '拖入常用文件或应用'
        : `拖入${zone?.name || '分区'}常用项`;
    }
    if (emptyCopy) emptyCopy.textContent = '支持文件、文件夹和应用；这里只保存快捷引用。';
  }

  function renderZoneManager() {
    const refs = getRefs();
    const folderConfig = normalizeFolderConfig(currentConfig);
    if (!refs.zoneManagerList) return;

    refs.zoneManagerList.innerHTML = folderConfig.zones.map((zone) => `
      <div class="ff-zone-manager-row">
        <span class="ff-zone-manager-name">${renderZoneIcon(zone, 'ff-zone-manager-icon')}<span>${escapeHtml(zone.name)}</span></span>
        <button type="button" data-action="rename-zone" data-category-id="${escapeHtml(zone.id)}" title="重命名">
          ${svgIcon('ff-edit')}
        </button>
        <button
          type="button"
          class="is-danger"
          data-action="delete-zone"
          data-category-id="${escapeHtml(zone.id)}"
          title="删除"
          ${zone.custom ? '' : 'disabled'}
        >
          ${svgIcon('ff-trash')}
        </button>
      </div>
    `).join('');
  }

  function applyVisualConfig() {
    const refs = getRefs();
    const folderConfig = normalizeFolderConfig(currentConfig);
    const size = getSizeFromConfig();
    const opacity = Number(currentConfig.opacity) || 1;

    document.body.dataset.floatingFolderSize = size;
    document.body.classList.toggle('ff-hide-labels', !folderConfig.showLabels);
    document.body.classList.toggle('ff-hide-hint', !folderConfig.showHint || Boolean(detachedZoneId));
    document.body.classList.toggle('ff-detached-zone', Boolean(detachedZoneId));
    document.body.style.setProperty('--ff-icon-size', `${folderConfig.iconSize}px`);
    // 这些变量在 floatingFolder 的 body 作用域中有尺寸预设，运行时值也必须
    // 写到同一作用域，否则 body 上的默认值会覆盖 documentElement 的值。
    document.body.style.setProperty('--ff-icon-size', `${folderConfig.iconSize}px`);
    document.body.style.setProperty('--ff-grid-gap', `${folderConfig.iconGap}px`);
    document.body.style.setProperty('--ff-widget-opacity', String(opacity));

    if (refs.iconSizeInput) refs.iconSizeInput.value = String(folderConfig.iconSize);
    if (refs.iconSizeOutput) refs.iconSizeOutput.value = `${folderConfig.iconSize}px`;
    if (refs.iconGapInput) refs.iconGapInput.value = String(folderConfig.iconGap);
    if (refs.iconGapOutput) refs.iconGapOutput.value = `${folderConfig.iconGap}px`;
    if (refs.opacityInput) refs.opacityInput.value = String(Math.round(opacity * 100));
    if (refs.opacityOutput) refs.opacityOutput.value = `${Math.round(opacity * 100)}%`;
    if (refs.labelsInput) refs.labelsInput.checked = folderConfig.showLabels;
    if (refs.hintInput) refs.hintInput.checked = folderConfig.showHint;
    if (refs.compactLabel) refs.compactLabel.textContent = size === 'compact' ? '切换宽松模式' : '切换紧凑模式';
    const windowMode = getCurrentWindowMode();
    document.querySelectorAll('#floating-folder-window-mode-controls [data-window-mode]').forEach((button) => {
      const active = button.dataset.windowMode === windowMode;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-checked', String(active));
    });
    if (refs.pinButton) {
      const pinned = windowMode === 'desktop';
      refs.pinButton.setAttribute('aria-pressed', String(pinned));
      refs.pinButton.classList.toggle('is-active', pinned);
      refs.pinButton.setAttribute('aria-label', pinned ? '取消固定到桌面' : '固定到桌面');
    }
  }

  function renderShell(payload = {}, options = {}) {
    const refs = getRefs();
    const zone = getActiveZone();
    const title = detachedZoneId ? (zone?.name || currentWidgetName) : (currentWidgetName || '快捷收纳区');

    if (refs.title) refs.title.textContent = title;
    if (refs.count) refs.count.textContent = `${latestFiles.length} 项`;

    renderTabs();
    renderFiles({ animate: options.animateFiles === true });
    renderZoneManager();
    applyVisualConfig();

    if (!latestFiles.length) {
      showMessage('拖入文件、文件夹或应用，即可创建快捷方式。');
    } else {
      showMessage(`当前：${zone?.name || '主页'} · ${getFilesForZone(activeZoneId).length} 项`);
    }
  }

  async function refreshFiles(options = {}) {
    const targetWidgetId = sourceWidgetId || currentWidgetId;
    const storedConfig = await readWidgetConfig(targetWidgetId);
    if (storedConfig.floatingFolder) {
      currentConfig = {
        ...currentConfig,
        floatingFolder: storedConfig.floatingFolder
      };
    }
    const folderConfig = normalizeFolderConfig(currentConfig);
    const shortcutFiles = window.api?.resolveFloatingFolderFiles
      ? await window.api.resolveFloatingFolderFiles(folderConfig.addedFilePaths)
      : [];
    const removedPaths = new Set(folderConfig.removedFilePaths.map(normalizeFileKey));
    const mergedFiles = new Map();
    (shortcutFiles || []).forEach((file) => {
      const key = getFileKey(file);
      if (key && !removedPaths.has(normalizeFileKey(key))) mergedFiles.set(normalizeFileKey(key), file);
    });
    latestFiles = [...mergedFiles.values()];
    latestPayload = { files: latestFiles };
    renderShell(latestPayload, options);
    return latestPayload;
  }

  async function addShortcutPaths(filePaths) {
    if (!filePaths.length) {
      showToast('未能读取要添加的项目');
      return;
    }

    const resolvedFiles = window.api?.resolveFloatingFolderFiles
      ? await window.api.resolveFloatingFolderFiles(filePaths)
      : [];
    const resolvedPaths = resolvedFiles.map(getFileKey).filter(Boolean);
    if (!resolvedPaths.length) {
      showToast('选择的文件、文件夹或应用不可用');
      return;
    }

    const folderConfig = normalizeFolderConfig(currentConfig);
    folderConfig.addedFilePaths = [...new Set([...folderConfig.addedFilePaths, ...resolvedPaths])];
    folderConfig.removedFilePaths = folderConfig.removedFilePaths.filter((filePath) => !resolvedPaths.includes(filePath));
    Object.keys(folderConfig.zoneOrders).forEach((zoneId) => {
      folderConfig.zoneOrders[zoneId] = folderConfig.zoneOrders[zoneId].filter((key) => !resolvedPaths.includes(key));
    });
    folderConfig.zoneOrders[activeZoneId] = [
      ...(folderConfig.zoneOrders[activeZoneId] || []),
      ...resolvedPaths
    ];
    await persistFolderConfig(folderConfig);
    await refreshFiles({ animateFiles: true });
    showToast(`已加入 ${resolvedPaths.length} 项到“${getActiveZone()?.name || '主页'}”`);
  }

  async function addDroppedFiles(dataTransfer) {
    if (!dataTransfer?.files?.length || !window.api?.getPathForFile) return;
    const filePaths = [...dataTransfer.files]
      .map((file) => window.api.getPathForFile(file))
      .filter(Boolean);
    await addShortcutPaths(filePaths);
  }

  async function handleChooseItems() {
    if (!window.api?.chooseFloatingFolderItems) return;
    const result = await window.api.chooseFloatingFolderItems();
    if (result?.canceled) {
      if (result.message) showToast(result.message);
      return;
    }
    await addShortcutPaths(result.filePaths || []);
  }

  async function openSelectedFile(file) {
    if (!file) return;
    try {
      const result = await window.api.openFloatingFolderFile(sourceWidgetId || currentWidgetId, file.filePath);

      if (result?.success === false) {
        throw new Error(result.message || '无法打开该项目。');
      }

      showMessage('已使用系统默认程序打开。');
      showToast('已使用系统默认程序打开');
    } catch (error) {
      showMessage('文件不可用，请刷新后重试。');
    }
  }

  async function updatePinned(nextPinned) {
    const mode = nextPinned ? 'desktop' : 'normal';
    await updateWindowMode(mode);
  }

  function getCurrentWindowMode() {
    if (window.DwmUi.isWindowMode(currentConfig.windowMode)) {
      return currentConfig.windowMode;
    }
    return currentConfig.pinned === false ? 'normal' : 'desktop';
  }

  async function updateWindowMode(mode) {
    if (!window.DwmUi.isWindowMode(mode)) return;
    if (window.api?.setWidgetWindowMode) {
      const result = await window.api.setWidgetWindowMode(currentWidgetId, mode);
      currentConfig = {
        ...currentConfig,
        windowMode: result.windowMode,
        pinned: result.windowMode === 'desktop'
      };
    } else {
      currentConfig = await window.api.updateWidgetLayoutConfig(currentWidgetId, { windowMode: mode });
    }
    applyVisualConfig();
    const labels = {
      desktop: '已固定到桌面',
      normal: '已切换为普通窗口',
      alwaysOnTop: '已设为始终置顶'
    };
    showToast(labels[mode]);
  }

  async function updateSize(size) {
    const preset = SIZE_PRESETS[size];
    if (!preset) return;
    currentConfig = await window.api.updateWidgetLayoutConfig(currentWidgetId, {
      width: preset.width,
      height: preset.height,
      floatingFolder: {
        ...normalizeFolderConfig(currentConfig),
        iconSize: preset.iconSize,
        iconGap: preset.gap
      }
    });
    if (sourceWidgetId !== currentWidgetId) {
      const sourceConfig = await readWidgetConfig(sourceWidgetId);
      currentConfig = {
        ...sourceConfig,
        width: preset.width,
        height: preset.height,
        opacity: currentConfig.opacity,
        windowMode: currentConfig.windowMode,
        pinned: currentConfig.pinned,
        locked: currentConfig.locked,
        floatingFolderSourceWidgetId: sourceWidgetId,
        floatingFolderDetachedZoneId: detachedZoneId
      };
    }
    applyVisualConfig();
  }

  async function updateOpacity(percent) {
    const opacity = Math.min(Math.max(Number(percent) / 100, 0.3), 1);
    currentConfig = await window.api.updateWidgetLayoutConfig(currentWidgetId, { opacity });
    applyVisualConfig();
  }

  function closePanels() {
    ['#floating-folder-settings-panel', '#floating-folder-more-menu', '#floating-folder-zone-form', '#floating-folder-zone-manager']
      .forEach((selector) => {
        const element = document.querySelector(selector);
        if (element) DwmUi.hideMotionPanel(element);
      });
    closeFileContextMenu();
    document.querySelector('#floating-folder-settings-btn')?.setAttribute('aria-expanded', 'false');
    document.querySelector('#floating-folder-more-btn')?.setAttribute('aria-expanded', 'false');
  }

  function togglePanel(panel, button) {
    const opening = panel.hidden;
    closePanels();
    if (opening) DwmUi.showMotionPanel(panel);
    button?.setAttribute('aria-expanded', String(opening));
  }

  function openZoneForm(mode = 'create', zoneId = '') {
    const refs = getRefs();
    const folderConfig = normalizeFolderConfig(currentConfig);
    const zone = folderConfig.zones.find((item) => item.id === zoneId);
    closePanels();
    refs.zoneForm.dataset.mode = mode;
    refs.zoneForm.dataset.categoryId = zoneId;
    refs.zoneForm.querySelector('label').textContent = mode === 'rename' ? '重命名分区' : '新分区名称';
    refs.zoneForm.querySelector('[type="submit"]').textContent = mode === 'rename' ? '保存' : '创建';
    refs.zoneName.value = mode === 'rename' ? zone?.name || '' : '';
    DwmUi.showMotionPanel(refs.zoneForm);
    setZoneIconSelection(mode === 'rename' ? zone?.iconKey : 'home');
    window.requestAnimationFrame(() => refs.zoneName.focus());
  }

  async function submitZoneForm(event) {
    event.preventDefault();
    const refs = getRefs();
    const name = refs.zoneName.value.trim().slice(0, 8);
    const mode = refs.zoneForm.dataset.mode || 'create';
    const zoneId = refs.zoneForm.dataset.categoryId || '';
    const iconKey = getZoneIconOption(refs.zoneIcon?.value).key;
    const folderConfig = normalizeFolderConfig(currentConfig);

    if (!name) {
      showMessage('请输入分区名称。');
      return;
    }

    if (folderConfig.zones.some((zone) => zone.name === name && zone.id !== zoneId)) {
      showMessage('已经存在同名分区。');
      return;
    }

    if (mode === 'rename') {
      folderConfig.zones = folderConfig.zones.map((zone) => (
        zone.id === zoneId && zone.custom ? { ...zone, name, iconKey } : zone
      ));
      showToast('分区已重命名');
    } else {
      const nextZone = { id: `custom-${Date.now()}`, name, custom: true, iconKey };
      folderConfig.zones = [...folderConfig.zones, nextZone];
      activeZoneId = nextZone.id;
      folderConfig.activeZoneId = activeZoneId;
      showToast('已创建分区');
    }

    await persistFolderConfig(folderConfig);
    DwmUi.hideMotionPanel(refs.zoneForm);
    renderShell(latestPayload || {});
  }

  async function deleteZone(zoneId) {
    const folderConfig = normalizeFolderConfig(currentConfig);
    const zone = folderConfig.zones.find((item) => item.id === zoneId);
    if (!zone?.custom) return;
    folderConfig.zones = folderConfig.zones.filter((item) => item.id !== zoneId);
    delete folderConfig.zoneOrders[zoneId];
    if (activeZoneId === zoneId) activeZoneId = 'home';
    folderConfig.activeZoneId = activeZoneId;
    await persistFolderConfig(folderConfig);
    renderShell(latestPayload || {});
    showToast('分区已删除');
  }

  async function sortActiveZone() {
    const folderConfig = normalizeFolderConfig(currentConfig);
    const files = getFilesForZone(activeZoneId).sort((left, right) => left.name.localeCompare(right.name, 'zh-CN'));
    folderConfig.zoneOrders[activeZoneId] = files.map(getFileKey);
    await persistFolderConfig(folderConfig);
    renderFiles();
    showToast('当前分区已整理');
  }

  async function saveCurrentZoneOrder(files) {
    const folderConfig = normalizeFolderConfig(currentConfig);
    folderConfig.zoneOrders[activeZoneId] = files.map(getFileKey);
    await persistFolderConfig(folderConfig);
  }

  async function detachCurrentZone() {
    if (!window.api?.createWidget || detachedZoneId) return;
    const zone = getActiveZone();
    if (!zone) return;

    const folderConfig = normalizeFolderConfig(currentConfig);
    const movedPaths = getFilesForZone(zone.id).map(getFileKey).filter(Boolean);
    const movedPathKeys = new Set(movedPaths.map(normalizeFileKey));
    const detachedFolderConfig = {
      ...folderConfig,
      zones: [{ ...zone }],
      zoneOrders: { [zone.id]: movedPaths },
      activeZoneId: zone.id,
      showHint: false,
      addedFilePaths: movedPaths,
      removedFilePaths: []
    };
    const widget = await window.api.createWidget({
      type: 'floatingFolder',
      name: zone.name,
      layoutConfig: {
        width: 340,
        height: 300,
        windowMode: 'desktop',
        floatingFolderDetachedZoneId: zone.id,
        floatingFolder: detachedFolderConfig
      }
    });

    if (widget?.id) {
      const remainingFolderConfig = normalizeFolderConfig(currentConfig);
      remainingFolderConfig.zones = remainingFolderConfig.zones.filter((item) => item.id !== zone.id);
      delete remainingFolderConfig.zoneOrders[zone.id];
      Object.keys(remainingFolderConfig.zoneOrders).forEach((zoneId) => {
        remainingFolderConfig.zoneOrders[zoneId] = remainingFolderConfig.zoneOrders[zoneId]
          .filter((filePath) => !movedPathKeys.has(normalizeFileKey(filePath)));
      });
      remainingFolderConfig.addedFilePaths = remainingFolderConfig.addedFilePaths
        .filter((filePath) => !movedPathKeys.has(normalizeFileKey(filePath)));
      remainingFolderConfig.removedFilePaths = remainingFolderConfig.removedFilePaths
        .filter((filePath) => !movedPathKeys.has(normalizeFileKey(filePath)));
      activeZoneId = remainingFolderConfig.zones[0]?.id || '';
      remainingFolderConfig.activeZoneId = activeZoneId;

      await persistFolderConfig(remainingFolderConfig);
      await refreshFiles();
      showToast(`“${zone.name}”已移出并成为独立组件`);
    }
  }

  async function resetFolderLayout() {
    // “恢复默认布局”只重置分区和排序，不触碰齿轮中的外观设置或图钉的窗口层级。
    // 已收纳的文件保留，并全部回到默认的“主页”分区。
    const currentFolderConfig = normalizeFolderConfig(currentConfig);
    const defaultFolderConfig = normalizeFolderConfig({});
    defaultFolderConfig.addedFilePaths = currentFolderConfig.addedFilePaths;
    defaultFolderConfig.removedFilePaths = currentFolderConfig.removedFilePaths;
    activeZoneId = defaultFolderConfig.activeZoneId;
    await persistFolderConfig(defaultFolderConfig);
    await refreshFiles();
    showToast('已恢复默认布局');
  }

  function beginIconPointer(event) {
    const item = event.target.closest('.ff-app-item');
    if (!item || event.button !== 0) return;
    iconPointer = {
      item,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      sourceIndex: Number(item.dataset.fileIndex),
      targetIndex: Number(item.dataset.fileIndex),
      dragging: false
    };
  }

  function moveIconPointer(event) {
    if (!iconPointer || iconPointer.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - iconPointer.startX, event.clientY - iconPointer.startY);
    if (!iconPointer.dragging && distance < 6) return;
    if (!iconPointer.dragging) {
      iconPointer.dragging = true;
      iconDragOccurred = true;
      iconPointer.item.classList.add('is-dragging');
    }
    event.preventDefault();
    const target = document.elementFromPoint(event.clientX, event.clientY)?.closest('.ff-app-item');
    document.querySelectorAll('.ff-app-item.is-drop-target').forEach((node) => node.classList.remove('is-drop-target'));
    if (target && target !== iconPointer.item) {
      iconPointer.targetIndex = Number(target.dataset.fileIndex);
      target.classList.add('is-drop-target');
    }
  }

  async function endIconPointer(event) {
    if (!iconPointer || iconPointer.pointerId !== event.pointerId) return;
    if (iconPointer.dragging) {
      const files = getFilesForZone(activeZoneId);
      const [moved] = files.splice(iconPointer.sourceIndex, 1);
      files.splice(iconPointer.targetIndex, 0, moved);
      await saveCurrentZoneOrder(files);
      renderFiles();
      showToast('图标顺序已保存');
      window.setTimeout(() => { iconDragOccurred = false; }, 80);
    }
    iconPointer = null;
  }

  function beginZonePull(event) {
    if (detachedZoneId || event.button !== 0) return;
    const button = event.target.closest('.ff-zone-tab[data-category-id]');
    if (!button) return;
    zonePointer = {
      button,
      categoryId: button.dataset.categoryId,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      ghost: null
    };
    button.setPointerCapture?.(event.pointerId);
  }

  function moveZonePull(event) {
    if (!zonePointer || zonePointer.pointerId !== event.pointerId) return;
    const distance = Math.hypot(event.clientX - zonePointer.startX, event.clientY - zonePointer.startY);
    if (!zonePointer.dragging && distance < 8) return;
    if (!zonePointer.dragging) {
      zonePointer.dragging = true;
      zoneDragOccurred = true;
      zonePointer.button.classList.add('is-zone-dragging');
      zonePointer.ghost = document.createElement('div');
      zonePointer.ghost.className = 'ff-zone-drag-ghost';
      zonePointer.ghost.innerHTML = `${svgIcon('ff-folder')}<span>${escapeHtml(zonePointer.button.textContent)}分区</span>`;
      document.body.appendChild(zonePointer.ghost);
    }
    event.preventDefault();
    const tabsRect = getRefs().tabs.getBoundingClientRect();
    const outside = event.clientX < tabsRect.left - 18 || event.clientX > tabsRect.right + 18 || event.clientY < tabsRect.top - 18 || event.clientY > tabsRect.bottom + 18;
    zonePointer.ghost.classList.toggle('is-ready', outside);
    zonePointer.ghost.style.left = `${event.clientX}px`;
    zonePointer.ghost.style.top = `${event.clientY}px`;
  }

  async function endZonePull(event) {
    if (!zonePointer || zonePointer.pointerId !== event.pointerId) return;
    if (zonePointer.dragging) {
      const tabsRect = getRefs().tabs.getBoundingClientRect();
      const outside = event.clientX < tabsRect.left - 18 || event.clientX > tabsRect.right + 18 || event.clientY < tabsRect.top - 18 || event.clientY > tabsRect.bottom + 18;
      if (outside) {
        activeZoneId = zonePointer.categoryId;
        await persistFolderConfig({ ...normalizeFolderConfig(currentConfig), activeZoneId });
        await detachCurrentZone();
      }
    }
    zonePointer.button.classList.remove('is-zone-dragging');
    zonePointer.ghost?.remove();
    zonePointer = null;
    window.setTimeout(() => { zoneDragOccurred = false; }, 0);
  }

  function bindEvents() {
    const refs = getRefs();
    globalEventController?.abort();
    globalEventController = new AbortController();
    const globalEventOptions = { signal: globalEventController.signal };

    refs.root?.addEventListener('dragenter', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      externalDragDepth += 1;
      refs.root.classList.add('is-external-dragover');
    });
    refs.root?.addEventListener('dragover', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      refs.root.classList.add('is-external-dragover');
    });
    refs.root?.addEventListener('dragleave', (event) => {
      if (!event.dataTransfer?.types?.includes('Files')) return;
      externalDragDepth = Math.max(0, externalDragDepth - 1);
      if (externalDragDepth === 0) refs.root.classList.remove('is-external-dragover');
    });
    refs.root?.addEventListener('drop', async (event) => {
      if (!event.dataTransfer?.files?.length) return;
      event.preventDefault();
      externalDragDepth = 0;
      refs.root.classList.remove('is-external-dragover');
      await addDroppedFiles(event.dataTransfer);
    });

    refs.tabs?.addEventListener('click', async (event) => {
      if (zoneDragOccurred) {
        event.preventDefault();
        zoneDragOccurred = false;
        return;
      }
      const zoneButton = event.target.closest('[data-category-id]');
      const actionButton = event.target.closest('[data-action="new-zone"]');
      if (zoneButton) {
        activeZoneId = zoneButton.dataset.categoryId;
        await persistFolderConfig({ ...normalizeFolderConfig(currentConfig), activeZoneId });
        renderTabs();
        renderFiles({ animate: true });
        showMessage(`当前：${getActiveZone()?.name || '主页'} · ${getFilesForZone(activeZoneId).length} 项`);
      }
      if (actionButton) openZoneForm();
    });
    refs.tabs?.addEventListener('pointerdown', beginZonePull);
    document.addEventListener('pointermove', moveZonePull, globalEventOptions);
    document.addEventListener('pointerup', endZonePull, globalEventOptions);
    document.addEventListener('pointercancel', endZonePull, globalEventOptions);

    refs.grid?.addEventListener('click', (event) => {
      if (iconDragOccurred) {
        iconDragOccurred = false;
        return;
      }
      const item = event.target.closest('.ff-app-item');
      if (!item) return;
      selectedFilePath = item.dataset.filePath;
      renderFiles();
      const file = getFilesForZone(activeZoneId)[Number(item.dataset.fileIndex)];
      openSelectedFile(file);
    });
    refs.grid?.addEventListener('dblclick', (event) => {
      const item = event.target.closest('.ff-app-item');
      const file = getFilesForZone(activeZoneId)[Number(item?.dataset.fileIndex)];
      openSelectedFile(file);
    });
    refs.grid?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      const item = event.target.closest('.ff-app-item');
      const file = getFilesForZone(activeZoneId)[Number(item?.dataset.fileIndex)];
      openSelectedFile(file);
    });
    refs.grid?.addEventListener('pointerdown', beginIconPointer);
    refs.grid?.addEventListener('contextmenu', (event) => {
      const item = event.target.closest('.ff-app-item');
      if (!item) return;
      event.preventDefault();
      event.stopPropagation();
      const file = getFilesForZone(activeZoneId)[Number(item.dataset.fileIndex)];
      openFileContextMenu(file, event.clientX, event.clientY);
    }, true);
    document.addEventListener('pointermove', moveIconPointer, globalEventOptions);
    document.addEventListener('pointerup', endIconPointer, globalEventOptions);
    document.addEventListener('pointercancel', endIconPointer, globalEventOptions);

    refs.pinButton?.addEventListener('click', () => updatePinned(refs.pinButton.getAttribute('aria-pressed') !== 'true'));
    refs.settingsButton?.addEventListener('click', () => togglePanel(refs.settingsPanel, refs.settingsButton));
    refs.moreButton?.addEventListener('click', () => togglePanel(refs.moreMenu, refs.moreButton));
    document.querySelector('#floating-folder-close-btn')?.addEventListener('click', async () => {
      await window.api.updateWidgetVisible(currentWidgetId, false);
    });
    refs.fileMenu?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-file-menu-action]');
      if (!button) return;
      const filePath = refs.fileMenu.dataset.filePath;
      const file = latestFiles.find((item) => getFileKey(item) === filePath);
      if (button.dataset.fileMenuAction === 'open') {
        closeFileContextMenu();
        await openSelectedFile(file);
      }
      if (button.dataset.fileMenuAction === 'remove') {
        await removeFileFromCollection(filePath);
      }
    });
    refs.zoneForm?.addEventListener('submit', submitZoneForm);
    refs.zoneForm?.addEventListener('click', (event) => {
      const iconButton = event.target.closest('[data-zone-icon]');
      if (iconButton) setZoneIconSelection(iconButton.dataset.zoneIcon);
    });
    document.querySelector('#floating-folder-cancel-zone')?.addEventListener('click', () => DwmUi.hideMotionPanel(refs.zoneForm));
    document.querySelector('#floating-folder-close-zone-manager')?.addEventListener('click', () => DwmUi.hideMotionPanel(refs.zoneManager));

    refs.moreMenu?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      const action = button.dataset.action;
      DwmUi.hideMotionPanel(refs.moreMenu);
      if (action === 'new-zone') openZoneForm();
      if (action === 'manage-zones') {
        closePanels();
        DwmUi.showMotionPanel(refs.zoneManager);
      }
      if (action === 'add-items') await handleChooseItems();
      if (action === 'detach-zone') await detachCurrentZone();
      if (action === 'sort-zone') await sortActiveZone();
      if (action === 'compact') await updateSize(getSizeFromConfig() === 'compact' ? 'large' : 'compact');
      if (action === 'reset') await resetFolderLayout();
    });

    refs.zoneManagerList?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-action]');
      if (!button) return;
      if (button.dataset.action === 'rename-zone') openZoneForm('rename', button.dataset.categoryId);
      if (button.dataset.action === 'delete-zone') deleteZone(button.dataset.categoryId);
    });

    refs.iconSizeInput?.addEventListener('input', () => {
      updateFolderVisualPreference('iconSize', refs.iconSizeInput.value);
    });
    refs.iconGapInput?.addEventListener('input', () => {
      updateFolderVisualPreference('iconGap', refs.iconGapInput.value);
    });
    refs.opacityInput?.addEventListener('input', () => updateOpacity(refs.opacityInput.value));
    document.querySelector('#floating-folder-window-mode-controls')?.addEventListener('click', async (event) => {
      const button = event.target.closest('[data-window-mode]');
      if (button) await updateWindowMode(button.dataset.windowMode);
    });
    refs.labelsInput?.addEventListener('change', async () => {
      const folderConfig = normalizeFolderConfig(currentConfig);
      folderConfig.showLabels = refs.labelsInput.checked;
      await persistFolderConfig(folderConfig);
      applyVisualConfig();
    });
    refs.hintInput?.addEventListener('change', async () => {
      const folderConfig = normalizeFolderConfig(currentConfig);
      folderConfig.showHint = refs.hintInput.checked;
      await persistFolderConfig(folderConfig);
      applyVisualConfig();
    });

    document.addEventListener('pointerdown', (event) => {
      if (!event.target.closest('.ff-popover, .ff-icon-button, .ff-zone-tab--add')) closePanels();
    }, { capture: true, ...globalEventOptions });
    window.addEventListener('widget-context-menu-requested', (event) => {
      const detail = event.detail || {};
      const item = document.elementFromPoint(Number(detail.x) || 0, Number(detail.y) || 0)?.closest('.ff-app-item');
      if (!item) return;
      const file = getFilesForZone(activeZoneId)[Number(item.dataset.fileIndex)];
      openFileContextMenu(file, Number(detail.x) || 12, Number(detail.y) || 12);
    }, globalEventOptions);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') closePanels();
    }, globalEventOptions);
  }

  function renderSprite() {
    return `
      <svg class="ff-svg-sprite" aria-hidden="true">
        <defs>
          <symbol id="ff-pin" viewBox="0 0 24 24"><path d="M8.2 3.5h7.6l-1 5 3.1 3.1v1.8H13v6.8l-1 1.3-1-1.3v-6.8H6.1v-1.8l3.1-3.1-1-5Z"/></symbol>
          <symbol id="ff-settings" viewBox="0 0 24 24"><path d="M9.5 3.8 10 2h4l.5 1.8 1.6.9 1.8-.5 2 3.4-1.3 1.3v1.8l1.3 1.3-2 3.4-1.8-.5-1.6.9L14 18h-4l-.5-2.2-1.6-.9-1.8.5-2-3.4 1.3-1.3V8.9L4.1 7.6l2-3.4 1.8.5 1.6-.9Z"/><circle cx="12" cy="10" r="2.6"/></symbol>
          <symbol id="ff-more" viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></symbol>
          <symbol id="ff-close" viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></symbol>
          <symbol id="ff-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
          <symbol id="ff-edit" viewBox="0 0 24 24"><path d="m5 16.7-.8 3.1 3.1-.8L18 8.3 15.7 6 5 16.7Z"/><path d="m14.6 7.1 2.3 2.3"/></symbol>
          <symbol id="ff-trash" viewBox="0 0 24 24"><path d="M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 10v7M14 10v7"/></symbol>
          <symbol id="ff-reset" viewBox="0 0 24 24"><path d="M6.3 7.3A7 7 0 1 1 5 14"/><path d="M3.5 4.5v5h5"/></symbol>
          <symbol id="ff-layout" viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.4"/><rect x="14" y="3" width="7" height="7" rx="1.4"/><rect x="3" y="14" width="7" height="7" rx="1.4"/><rect x="14" y="14" width="7" height="7" rx="1.4"/></symbol>
          <symbol id="ff-move" viewBox="0 0 24 24"><path d="M12 3v18M3 12h18M9 6l3-3 3 3M9 18l3 3 3-3M6 9l-3 3 3 3M18 9l3 3-3 3"/></symbol>
          <symbol id="ff-folder" viewBox="0 0 24 24"><path d="M3 6.5h6l2-2h4.5l1.5 2H21v12H3v-12Z"/><path d="M3 9h18"/></symbol>
          <symbol id="ff-file" viewBox="0 0 24 24"><path d="M6 2.8h8l4 4V21H6V2.8Z"/><path d="M14 2.8v5h4M9 12h6M9 16h6"/></symbol>
          <symbol id="ff-pdf" viewBox="0 0 24 24"><path d="M6 2.8h8l4 4V21H6V2.8Z"/><path d="M8.5 15c3.8-1.1 6-3.2 6.4-6 .7 2.7 1.4 5 3.1 6.4-3.6-1-6.2-1-9.5-.4Z"/></symbol>
          <symbol id="ff-image" viewBox="0 0 24 24"><rect x="3" y="4" width="18" height="16" rx="3"/><circle cx="9" cy="9" r="2"/><path d="m5 18 5-5 3 3 2-2 4 4"/></symbol>
          <symbol id="ff-cube" viewBox="0 0 24 24"><path d="m12 2.8 8 4.6v9.2l-8 4.6-8-4.6V7.4l8-4.6Z"/><path d="m4 7.4 8 4.7 8-4.7M12 12.1v9.1"/></symbol>
          <symbol id="ff-refresh" viewBox="0 0 24 24"><path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6.2 6.7L4 9M5.5 15a7 7 0 0 0 12.3 2.3L20 15"/></symbol>
        </defs>
      </svg>
    `;
  }

  window.FloatingFolderWidget = {
    label: '快捷收纳区',
    render() {
      return `
        ${renderSprite()}
        <section class="floating-folder-widget video-scene" aria-label="桌面快捷收纳区小组件">
          <header class="ff-titlebar" data-drag-handle>
            <div class="ff-title">
              <span class="ff-title-mark-shell" aria-hidden="true">
                <img class="ff-title-mark" src="./assets/floating-folder/quick-folder-title-icon.png" alt="" />
              </span>
              <div class="ff-title-copy">
                <strong id="floating-folder-title">快捷收纳区</strong>
              </div>
            </div>
            <div class="ff-title-actions">
              <button class="ff-icon-button" id="floating-folder-pin-btn" type="button" aria-label="固定到桌面" aria-pressed="true" title="固定到桌面">${svgIcon('ff-pin')}</button>
              <button class="ff-icon-button" id="floating-folder-settings-btn" type="button" aria-label="打开设置" aria-expanded="false" title="设置">${svgIcon('ff-settings')}</button>
              <button class="ff-icon-button" id="floating-folder-more-btn" type="button" aria-label="更多操作" aria-expanded="false" title="更多">${svgIcon('ff-more')}</button>
              <button class="ff-icon-button ff-icon-button--close" id="floating-folder-close-btn" type="button" aria-label="关闭收纳区" title="关闭">${svgIcon('ff-close')}</button>
            </div>
          </header>

          <nav class="ff-zone-tabs" id="floating-folder-zone-tabs" aria-label="收纳分区"></nav>

          <section class="ff-app-surface" aria-label="当前分区内容">
            <div class="ff-app-grid" id="floating-folder-grid" role="list"></div>
            <div class="ff-empty-state" id="floating-folder-empty" hidden>
              <img class="ff-empty-illustration" src="./assets/floating-folder/quick-folder-empty-state.png" alt="" />
              <strong>拖入常用文件或应用</strong>
              <span>支持文件、文件夹和应用；这里只保存快捷引用。</span>
            </div>
          </section>

          <footer class="ff-widget-hint" id="floating-folder-hint">
            ${svgIcon('ff-move')}
            <span>拖动顶部分区标签到桌面，可创建多个独立收纳区</span>
          </footer>

          <section class="ff-popover ff-settings-panel" id="floating-folder-settings-panel" hidden aria-label="收纳区设置">
            <div class="ff-popover-header"><strong>收纳区设置</strong><span id="floating-folder-count">0 项</span></div>
            <p class="ff-settings-description">调整窗口层级、图标与显示效果。</p>
            <div class="ff-setting-group">
              <span class="ff-setting-label">显示层级</span>
              <div class="ff-window-mode-controls" id="floating-folder-window-mode-controls" role="radiogroup" aria-label="显示层级">
                <button type="button" role="radio" data-window-mode="desktop" aria-checked="false">固定到桌面</button>
                <button type="button" role="radio" data-window-mode="normal" aria-checked="false">普通窗口</button>
                <button type="button" role="radio" data-window-mode="alwaysOnTop" aria-checked="false">始终置顶</button>
              </div>
            </div>
            <label class="ff-range-field">
              <span>图标大小 <output id="floating-folder-icon-size-output">54px</output></span>
              <input id="floating-folder-icon-size" type="range" min="38" max="68" value="54" />
            </label>
            <label class="ff-range-field">
              <span>图标间距 <output id="floating-folder-icon-gap-output">12px</output></span>
              <input id="floating-folder-icon-gap" type="range" min="5" max="22" value="12" />
            </label>
            <label class="ff-range-field">
              <span>组件透明度 <output id="floating-folder-opacity-output">100%</output></span>
              <input id="floating-folder-opacity" type="range" min="30" max="100" value="100" />
            </label>
            <div class="ff-toggle-list">
              <label><span>显示图标名称</span><input id="floating-folder-show-labels" type="checkbox" checked /><i></i></label>
              <label><span>显示底部提示</span><input id="floating-folder-show-hint" type="checkbox" checked /><i></i></label>
            </div>
          </section>

          <div class="ff-popover ff-more-menu" id="floating-folder-more-menu" hidden role="menu">
            <button type="button" data-action="add-items" role="menuitem">${svgIcon('ff-plus')}添加文件或应用</button>
            <button type="button" data-action="new-zone" role="menuitem">${svgIcon('ff-plus')}新建分区</button>
            <button type="button" data-action="manage-zones" role="menuitem">${svgIcon('ff-edit')}管理分区</button>
            <button type="button" data-action="detach-zone" role="menuitem">${svgIcon('ff-move')}拉出当前分区</button>
            <button type="button" data-action="sort-zone" role="menuitem">${svgIcon('ff-layout')}整理当前分区</button>
            <button type="button" data-action="compact" role="menuitem">${svgIcon('ff-layout')}<span id="floating-folder-compact-label">切换紧凑模式</span></button>
            <button type="button" data-action="reset" role="menuitem">${svgIcon('ff-reset')}恢复默认布局</button>
          </div>

          <form class="ff-popover ff-zone-form" id="floating-folder-zone-form" hidden>
            <label for="floating-folder-zone-name">新分区名称</label>
            <input id="floating-folder-zone-name" maxlength="8" autocomplete="off" placeholder="例如：设计" />
            <div class="ff-zone-icon-field">
              <span>选择分区图标</span>
              <input id="floating-folder-zone-icon" type="hidden" value="home" />
              <div class="ff-zone-icon-options" role="radiogroup" aria-label="选择分区图标">
                ${renderZoneIconOptions()}
              </div>
            </div>
            <div class="ff-form-actions">
              <button type="button" class="ff-button ff-button--ghost" id="floating-folder-cancel-zone">取消</button>
              <button type="submit" class="ff-button ff-button--primary">创建</button>
            </div>
          </form>

          <section class="ff-popover ff-zone-manager" id="floating-folder-zone-manager" hidden aria-label="分区管理">
            <div class="ff-popover-header"><strong>管理分区</strong><button type="button" class="ff-text-button" id="floating-folder-close-zone-manager">完成</button></div>
            <p>默认分区不可删除，自定义分区可以重命名或移除。</p>
            <div class="ff-zone-manager-list" id="floating-folder-zone-manager-list"></div>
          </section>

          <p id="floating-folder-message" class="ff-message"></p>
          <nav class="ff-popover ff-file-context-menu" id="floating-folder-file-menu" hidden aria-label="文件操作">
            <button type="button" data-file-menu-action="open">${svgIcon('ff-file')}打开文件</button>
            <button type="button" class="is-danger" data-file-menu-action="remove">${svgIcon('ff-trash')}从收纳区移除</button>
          </nav>
          <div class="ff-toast" id="floating-folder-toast" role="status" aria-live="polite"></div>
        </section>
      `;
    },
    async mount(params) {
      await loadRuntimeConfig(params);
      bindEvents();
      await refreshFiles({ animateFiles: true });
    },
    unmount() {
      globalEventController?.abort();
      globalEventController = null;
      window.clearTimeout(toastTimer);
      window.clearTimeout(visualConfigPersistTimer);
      toastTimer = null;
      visualConfigPersistTimer = null;
    }
  };
}());
