const path = require('path');

const binaryPath = path
  .join(__dirname, 'build', 'Release', 'windows_desktop_zorder.node')
  .replace('app.asar', 'app.asar.unpacked');

module.exports = require(binaryPath);
