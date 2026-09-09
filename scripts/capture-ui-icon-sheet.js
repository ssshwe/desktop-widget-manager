const fs = require('fs');
const path = require('path');
const { app, BrowserWindow } = require('electron');

const projectRoot = path.resolve(__dirname, '..');
const iconRoot = path.join(projectRoot, 'src', 'assets', 'ui-icons');
const outputPath = path.join(projectRoot, 'output', 'qa', 'notes-visual', 'icon-sheet.png');

app.commandLine.appendSwitch('disable-gpu');

app.whenReady().then(async () => {
  const icons = fs.readdirSync(iconRoot)
    .filter((name) => /^figma-icon-\d+\.svg$/i.test(name))
    .sort();
  const cells = icons.map((name) => {
    const source = fs.readFileSync(path.join(iconRoot, name), 'utf8');
    const dataUrl = `data:image/svg+xml;base64,${Buffer.from(source).toString('base64')}`;
    return `<figure><img src="${dataUrl}" alt="" /><figcaption>${name.replace('.svg', '')}</figcaption></figure>`;
  }).join('');
  const html = `<!doctype html><meta charset="utf-8"><style>
    *{box-sizing:border-box}body{margin:0;padding:24px;background:#edf3fb;font-family:Segoe UI,sans-serif;color:#26334a}
    main{display:grid;grid-template-columns:repeat(7,1fr);gap:14px}
    figure{display:grid;place-items:center;gap:10px;margin:0;padding:16px 8px;border:1px solid #d6dfec;border-radius:14px;background:white}
    img{width:44px;height:44px;object-fit:contain}figcaption{font-size:12px}
  </style><main>${cells}</main>`;
  const window = new BrowserWindow({ width: 980, height: 650, show: false, webPreferences: { contextIsolation: true, nodeIntegration: false } });
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
  await new Promise((resolve) => setTimeout(resolve, 180));
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, (await window.capturePage()).toPNG());
  window.destroy();
  app.quit();
}).catch((error) => {
  console.error(error);
  app.exit(1);
});
