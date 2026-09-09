(function registerDwmUiUtilities(global) {
  'use strict';

  const WINDOW_MODES = Object.freeze(['desktop', 'normal', 'alwaysOnTop']);
  const panelMotionState = new WeakMap();

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function clampNumber(value, min, max, fallback) {
    const numberValue = Number(value);
    return Number.isFinite(numberValue)
      ? Math.min(Math.max(numberValue, min), max)
      : fallback;
  }

  function isWindowMode(value) {
    return WINDOW_MODES.includes(value);
  }

  function getWidgetConfig(widgetConfigs, widgetId) {
    if (!widgetConfigs || typeof widgetConfigs !== 'object') {
      return {};
    }

    const id = String(widgetId);
    return widgetConfigs[id] || widgetConfigs[`widget-${id}`] || {};
  }

  function normalizeThemeConfig(config = {}) {
    return {
      theme: ['light', 'dark', 'glass'].includes(config.theme) ? config.theme : 'light',
      globalOpacity: clampNumber(config.globalOpacity, 0.45, 1, 0.92),
      borderRadius: Math.round(clampNumber(config.borderRadius, 4, 32, 24)),
      fontSize: Math.round(clampNumber(config.fontSize, 13, 20, 16)),
      shadow: config.shadow !== false
    };
  }

  function applyThemeConfig(config = {}) {
    const themeConfig = normalizeThemeConfig(config);
    const root = document.documentElement;

    document.body.dataset.theme = themeConfig.theme;
    document.body.classList.toggle('no-shadow', !themeConfig.shadow);
    root.style.setProperty('--app-font-size', `${themeConfig.fontSize}px`);
    root.style.setProperty('--surface-radius', `${themeConfig.borderRadius}px`);
    root.style.setProperty('--surface-opacity', String(themeConfig.globalOpacity));
    root.style.setProperty('--surface-shadow', themeConfig.shadow ? '0 18px 46px rgba(15, 23, 42, 0.18)' : 'none');

    return themeConfig;
  }

  function shouldReduceMotion() {
    return typeof global.matchMedia === 'function'
      && global.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function runMotion(targets, keyframes, options = {}) {
    if (!global.Motion?.animate || shouldReduceMotion()) {
      return null;
    }

    try {
      return global.Motion.animate(targets, keyframes, options);
    } catch (error) {
      console.warn('[ui] Motion animation skipped:', error);
      return null;
    }
  }

  function getMotionStagger(interval, options) {
    return global.Motion?.stagger && !shouldReduceMotion()
      ? global.Motion.stagger(interval, options)
      : 0;
  }

  function showMotionPanel(element, options = {}) {
    if (!element) return null;

    const previous = panelMotionState.get(element);
    const token = {};

    panelMotionState.set(element, token);
    previous?.animation?.cancel?.();
    previous?.clone?.remove();
    element.hidden = false;
    element.style.pointerEvents = '';
    const animation = runMotion(
      element,
      {
        opacity: [0, 1],
        y: [options.y ?? -6, 0],
        scale: [options.scale ?? 0.97, 1]
      },
      {
        type: 'spring',
        visualDuration: options.visualDuration ?? 0.2,
        bounce: options.bounce ?? 0.16
      }
    );

    token.animation = animation;
    return animation;
  }

  function hideMotionPanel(element, options = {}) {
    if (!element || element.hidden) return null;

    const previous = panelMotionState.get(element);
    const token = {};
    const rect = element.getBoundingClientRect();

    panelMotionState.set(element, token);
    previous?.animation?.cancel?.();
    previous?.clone?.remove();
    element.hidden = true;

    if (shouldReduceMotion() || !global.Motion?.animate || rect.width <= 0 || rect.height <= 0) {
      return null;
    }

    const clone = element.cloneNode(true);

    clone.hidden = false;
    clone.removeAttribute('id');
    clone.querySelectorAll('[id]').forEach((node) => node.removeAttribute('id'));
    [clone, ...clone.querySelectorAll('*')].forEach((node) => {
      [...node.attributes].forEach((attribute) => {
        if (attribute.name.startsWith('data-')) node.removeAttribute(attribute.name);
      });
    });
    clone.setAttribute('aria-hidden', 'true');
    Object.assign(clone.style, {
      position: 'fixed',
      left: `${rect.left}px`,
      top: `${rect.top}px`,
      width: `${rect.width}px`,
      height: `${rect.height}px`,
      margin: '0',
      pointerEvents: 'none',
      zIndex: '2147483000'
    });
    document.body.appendChild(clone);
    token.clone = clone;
    const animation = runMotion(
      clone,
      {
        opacity: [1, 0],
        x: [0, options.x ?? 0],
        y: [0, options.y ?? -4],
        scale: [1, options.scale ?? 0.98]
      },
      {
        duration: options.duration ?? 0.12,
        ease: 'easeIn'
      }
    );

    token.animation = animation;
    if (!animation?.finished) {
      clone.remove();
      return null;
    }

    animation.finished.catch(() => {}).finally(() => clone.remove());
    return animation;
  }

  global.DwmUi = Object.freeze({
    WINDOW_MODES,
    escapeHtml,
    clampNumber,
    isWindowMode,
    getWidgetConfig,
    normalizeThemeConfig,
    applyThemeConfig,
    shouldReduceMotion,
    runMotion,
    getMotionStagger,
    showMotionPanel,
    hideMotionPanel
  });
}(window));
