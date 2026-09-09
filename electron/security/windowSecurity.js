const path = require('path');
const { fileURLToPath } = require('url');

const APP_PAGE_ROOT = path.resolve(__dirname, '..', '..', 'src');

function isTrustedLocalUrl(url) {
  try {
    const parsedUrl = new URL(url);

    if (parsedUrl.protocol !== 'file:') return false;

    const targetPath = path.resolve(fileURLToPath(parsedUrl));
    const relativePath = path.relative(APP_PAGE_ROOT, targetPath);

    return relativePath === '' || (
      !relativePath.startsWith(`..${path.sep}`)
      && relativePath !== '..'
      && !path.isAbsolute(relativePath)
    );
  } catch (_) {
    return false;
  }
}

function protectWindowNavigation(browserWindow) {
  const contents = browserWindow?.webContents;

  if (!contents) return;

  // This application never creates child windows. Denying them avoids giving a
  // remote page the application's preload bridge when a renderer is compromised.
  contents.setWindowOpenHandler(() => ({ action: 'deny' }));

  // Both the manager and widgets load documents from src only. Block a
  // compromised renderer from replacing one with a remote or arbitrary local
  // page that would otherwise inherit the preload bridge.
  contents.on('will-navigate', (event, navigationUrl) => {
    if (!isTrustedLocalUrl(navigationUrl)) {
      event.preventDefault();
      console.warn(`[security] 已阻止窗口导航：${navigationUrl}`);
    }
  });
}

module.exports = {
  isTrustedLocalUrl,
  protectWindowNavigation
};
