const DISCARDED_KEY = 'notePaintDiscardedDraft';
let sequence = 0;

function location() {
  return wx.env.USER_DATA_PATH + '/note-paint-draft.json';
}

function readRaw() {
  const fs = wx.getFileSystemManager();
  const path = location();
  try { fs.accessSync(path); } catch (e) { return null; }
  return JSON.parse(fs.readFileSync(path, 'utf8'));
}

function read() {
  try {
    const draft = readRaw();
    if (!draft || draft.discarded) return { draft: null };
    let discarded;
    try { discarded = wx.getStorageSync(DISCARDED_KEY); } catch (e) { /* file remains the primary store */ }
    if (discarded && discarded === draft.token) return { draft: null };
    if (draft.version !== 1 || !draft.data || !Array.isArray(draft.data.graphObjects)) throw new Error('Invalid draft');
    return { draft };
  } catch (e) {
    console.error('读取草稿失败:', e);
    return { draft: null, error: true };
  }
}

function replace(value) {
  const fs = wx.getFileSystemManager();
  const path = location();
  fs.writeFileSync(path + '.tmp', JSON.stringify(value), 'utf8');
  fs.renameSync(path + '.tmp', path);
}

function write(payload) {
  try {
    replace(Object.assign({}, payload, {
      version: 1, token: Date.now() + ':' + (++sequence) + ':' + Math.random().toString(36).slice(2), updatedAt: Date.now()
    }));
    return { ok: true };
  } catch (e) {
    console.error('保存草稿失败:', e);
    return { ok: false };
  }
}

function clear() {
  // Invalidate before unlinking. A failed deletion must never revive discarded work.
  const current = read();
  if (!current.draft && !current.error) return { ok: true };
  try {
    replace({ version: 1, discarded: true });
    try { wx.getFileSystemManager().unlinkSync(location()); } catch (e) { /* tombstone is sufficient */ }
    return { ok: true };
  } catch (e) {
    try {
      if (!current.draft || !current.draft.token) throw e;
      wx.setStorageSync(DISCARDED_KEY, current.draft.token);
      return { ok: true };
    } catch (storageError) {
      console.error('清理草稿失败:', storageError);
      return { ok: false };
    }
  }
}

module.exports = { read, write, clear };
