const LIST_KEY = 'notePaintBoardFiles';
const FILE_KEY_PREFIX = 'notePaintBoardFile:';

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

function pad(n) {
  return n < 10 ? '0' + n : '' + n;
}

function getDefaultName(timestamp) {
  const date = new Date(timestamp);
  return '画板 ' +
    date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate());
}

function formatTime(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return date.getFullYear() + '-' +
    pad(date.getMonth() + 1) + '-' +
    pad(date.getDate()) + ' ' +
    pad(date.getHours()) + ':' +
    pad(date.getMinutes());
}

function sortFiles(files) {
  return files.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

function getFiles() {
  try {
    const files = wx.getStorageSync(LIST_KEY) || [];
    return sortFiles(files.slice());
  } catch (e) {
    console.error('读取画板列表失败:', e);
    return [];
  }
}

function setFiles(files) {
  wx.setStorageSync(LIST_KEY, sortFiles(files));
}

function fileKey(id) {
  return FILE_KEY_PREFIX + id;
}

function getFile(id) {
  if (!id) return null;
  try {
    return wx.getStorageSync(fileKey(id)) || null;
  } catch (e) {
    console.error('读取画板文件失败:', e);
    return null;
  }
}

function saveFile(payload) {
  const files = getFiles();
  const now = Date.now();

  const id = payload.id || uuidv4();
  const existingMeta = files.find(item => item.id === id);
  const createdAt = existingMeta ? existingMeta.createdAt : now;
  const name = payload.name || (existingMeta && existingMeta.name) || getDefaultName(now);
  const updatedAt = now;
  const thumbnail = payload.thumbnail || (existingMeta && existingMeta.thumbnail) || '';

  const file = {
    id,
    name,
    createdAt,
    updatedAt,
    thumbnail,
    data: clone(payload.data || {})
  };

  const meta = {
    id,
    name,
    createdAt,
    updatedAt,
    thumbnail
  };

  const nextFiles = files.filter(item => item.id !== id);
  nextFiles.push(meta);

  try {
    wx.setStorageSync(fileKey(id), file);
    setFiles(nextFiles);
    return {
      ok: true,
      file,
      files: sortFiles(nextFiles)
    };
  } catch (e) {
    console.error('保存画板文件失败:', e);
    return {
      ok: false,
      reason: 'storage',
      message: '保存失败，请稍后重试'
    };
  }
}

function renameFile(id, name) {
  const nextName = (name || '').trim();
  if (!id || !nextName) {
    return { ok: false, message: '请输入画板名称' };
  }

  const files = getFiles();
  const target = files.find(item => item.id === id);
  const file = getFile(id);
  if (!target || !file) {
    return { ok: false, message: '画板文件不存在' };
  }

  target.name = nextName;
  file.name = nextName;

  try {
    wx.setStorageSync(fileKey(id), file);
    setFiles(files);
    return { ok: true };
  } catch (e) {
    console.error('重命名画板失败:', e);
    return { ok: false, message: '重命名失败，请稍后重试' };
  }
}

function deleteFile(id) {
  if (!id) return { ok: false, message: '画板文件不存在' };
  const files = getFiles().filter(item => item.id !== id);

  try {
    wx.removeStorageSync(fileKey(id));
    setFiles(files);
    return { ok: true, files };
  } catch (e) {
    console.error('删除画板失败:', e);
    return { ok: false, message: '删除失败，请稍后重试' };
  }
}

module.exports = {
  getFiles,
  getFile,
  saveFile,
  renameFile,
  deleteFile,
  getDefaultName,
  formatTime,
  uuidv4
};
