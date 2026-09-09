const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

/**
 * Replaces a file only after the complete new content has reached disk.
 * Keeping the temporary file beside the target makes rename an atomic
 * operation on the same volume.
 */
function writeFileAtomic(filePath, data, options = {}) {
  const directory = path.dirname(filePath);
  const encoding = options.encoding;
  const temporaryPath = path.join(
    directory,
    `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(8).toString('hex')}.tmp`
  );
  let descriptor;

  fs.mkdirSync(directory, { recursive: true });

  try {
    descriptor = fs.openSync(temporaryPath, 'w', options.mode);
    fs.writeFileSync(descriptor, data, encoding);
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);
  } catch (error) {
    if (descriptor !== undefined) {
      try {
        fs.closeSync(descriptor);
      } catch (_) {
        // Preserve the original write error.
      }
    }
    try {
      fs.unlinkSync(temporaryPath);
    } catch (_) {
      // The temporary file may not have been created yet.
    }
    throw error;
  }
}

module.exports = {
  writeFileAtomic
};
