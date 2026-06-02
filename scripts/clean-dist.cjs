const fs = require('fs');
const path = require('path');

const distPath = path.join(__dirname, '..', 'dist');

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function removeDistWithRetries(targetPath, retries = 6) {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      if (!fs.existsSync(targetPath)) return;
      await fs.promises.rm(targetPath, { recursive: true, force: true, maxRetries: 0 });
      return;
    } catch (error) {
      const code = error && error.code;
      const retryable = code === 'EPERM' || code === 'EBUSY' || code === 'ENOTEMPTY';
      if (!retryable || attempt === retries) {
        throw error;
      }
      await sleep(200 * attempt);
    }
  }
}

(async () => {
  try {
    await removeDistWithRetries(distPath);
  } catch (error) {
    // Do not fail builds due to Windows file locks; report and continue.
    console.warn(`[clean-dist] Unable to fully remove dist: ${error?.message || error}`);
  }
})();

