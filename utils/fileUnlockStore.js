const FILE_UNLOCK_LIMIT_KEY = 'notePaintUnlockedFileLimit';
const DEFAULT_FILE_UNLOCK_LIMIT = 1;

function normalizeLimit(value) {
  const n = Number(value);
  if (!isFinite(n) || n < DEFAULT_FILE_UNLOCK_LIMIT) return DEFAULT_FILE_UNLOCK_LIMIT;
  return Math.floor(n);
}

function getUnlockedFileLimit() {
  try {
    const stored = wx.getStorageSync(FILE_UNLOCK_LIMIT_KEY);
    if (stored === '' || stored === undefined || stored === null) {
      wx.setStorageSync(FILE_UNLOCK_LIMIT_KEY, DEFAULT_FILE_UNLOCK_LIMIT);
      return DEFAULT_FILE_UNLOCK_LIMIT;
    }
    return normalizeLimit(stored);
  } catch (e) {
    console.error('读取文件解锁配置失败:', e);
    return DEFAULT_FILE_UNLOCK_LIMIT;
  }
}

function setUnlockedFileLimit(limit) {
  const nextLimit = normalizeLimit(limit);
  try {
    wx.setStorageSync(FILE_UNLOCK_LIMIT_KEY, nextLimit);
  } catch (e) {
    console.error('保存文件解锁配置失败:', e);
  }
  return nextLimit;
}

function canCreateFile(currentFileId, currentFileCount) {
  if (currentFileId) return true;
  return currentFileCount < getUnlockedFileLimit();
}

function unlockNextFile(currentFileCount) {
  return setUnlockedFileLimit(Math.max(getUnlockedFileLimit(), currentFileCount) + 1);
}

module.exports = {
  FILE_UNLOCK_LIMIT_KEY,
  DEFAULT_FILE_UNLOCK_LIMIT,
  getUnlockedFileLimit,
  setUnlockedFileLimit,
  canCreateFile,
  unlockNextFile
};
