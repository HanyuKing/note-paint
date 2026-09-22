const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const DRAFT_PATH = '/local/note-paint-draft.json';
const copy = value => JSON.parse(JSON.stringify(value));

function setup() {
  let now = new Date(2026, 8, 19, 12).getTime();
  let nextTimer = 0;
  const timers = new Map();
  const files = new Map();
  const values = new Map();
  const errors = {};
  const toasts = [];
  const modals = [];
  const navigation = [];
  const app = { globalData: {} };
  const modules = new Map();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const fail = action => { if (errors[action]) throw new Error('injected ' + action + ' failure'); };
  const fileSystem = {
    readFileSync(file) {
      fail('read');
      if (!files.has(file)) throw new Error('ENOENT');
      return files.get(file);
    },
    writeFileSync(file, value) { fail('write'); files.set(file, value); },
    renameSync(from, to) { fail('rename'); files.set(to, files.get(from)); files.delete(from); },
    unlinkSync(file) { fail('unlink'); files.delete(file); },
    accessSync(file) { if (!files.has(file)) throw new Error('ENOENT'); }
  };
  const wx = {
    env: { USER_DATA_PATH: '/local' },
    getFileSystemManager: () => fileSystem,
    getStorageSync: key => { fail('getStorage'); return values.has(key) ? copy(values.get(key)) : ''; },
    setStorageSync: (key, value) => { fail('setStorage'); values.set(key, copy(value)); },
    removeStorageSync: key => values.delete(key),
    getSystemInfoSync: () => ({ windowWidth: 375, windowHeight: 600, pixelRatio: 2 }),
    showToast: options => toasts.push(options),
    showModal: options => modals.push(options),
    switchTab: options => navigation.push(options),
    showShareMenu() {}, showLoading() {}, hideLoading() {}
  };
  const context = {
    wx, Date: Clock, getApp: () => app,
    console: { error() {}, warn() {}, log() {} },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  };
  function load(relative) {
    const fullPath = path.resolve(ROOT, relative);
    if (modules.has(fullPath)) return modules.get(fullPath);
    const module = { exports: {} };
    vm.runInNewContext(fs.readFileSync(fullPath, 'utf8'), Object.assign({}, context, {
      module,
      require: name => load(path.relative(ROOT, path.resolve(path.dirname(fullPath), name + '.js')))
    }));
    modules.set(fullPath, module.exports);
    return module.exports;
  }
  function createPage(name) {
    const relative = 'page/component/' + name + '/' + name + '.js';
    let definition;
    vm.runInNewContext(fs.readFileSync(path.join(ROOT, relative), 'utf8'), Object.assign({}, context, {
      Page: page => { definition = page; },
      require: value => load(path.relative(ROOT, path.resolve(ROOT, path.dirname(relative), value + '.js')))
    }));
    const page = Object.assign({}, definition, {
      data: copy(definition.data),
      setData(value, callback) { Object.assign(this.data, value); if (callback) callback(); }
    });
    page.onLoad();
    page.onShow();
    return page;
  }
  function advance(ms) {
    const end = now + ms;
    for (;;) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= end)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      now = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    now = end;
  }
  return { load, createPage, advance, files, values, errors, toasts, modals, navigation, app, wx };
}

function stroke(id) {
  return {
    id: id || 'line', type: 'path', x: 2, y: -3,
    points: [{ x: 10, y: 20 }, { x: 45, y: 60 }],
    itemBox: { minX: 10, maxX: 45, minY: 20, maxY: 60 },
    style: { color: '#EF4444', width: 5 }
  };
}

function draw(page, id) {
  page.data.graphObjects.push(stroke(id));
  page.markChanged();
}

test('one-second autosave restores content, tools, viewport and title without using a file slot', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  board.data.fileName = '我的灵感';
  draw(board);
  Object.assign(board.data, { scale: 0.7, translateX: -45, translateY: 90, tinctSize: 7, tinctCurr: -1,
    customColor: '#123456', currentMode: 'select', brushState: 'c' });
  env.advance(999);
  assert.equal(env.files.has(DRAFT_PATH), false);
  env.advance(1);
  assert.equal(env.load('utils/boardStore.js').getFiles().length, 0);
  board.onUnload();
  const restored = env.createPage('jdraw');
  assert.deepEqual(copy(restored.data.graphObjects), [stroke()]);
  for (const key of ['fileName', 'scale', 'translateX', 'translateY', 'tinctSize', 'tinctCurr', 'customColor', 'currentMode', 'brushState']) {
    assert.equal(restored.data[key], board.data[key], key);
  }
  assert.equal(restored.data.hasChanges, true);
  assert(env.toasts.some(item => item.title === '已恢复上次草稿'));
});

test('backgrounding during a stroke saves it, including a transition to a two-finger gesture', () => {
  for (const zooming of [false, true]) {
    const env = setup();
    const board = env.createPage('jdraw');
    board.context = {};
    board.touchstart({ touches: [{ x: 40, y: 80 }] });
    if (zooming) board.touchstart({ touches: [{ x: 40, y: 80 }, { x: 60, y: 100 }] });
    board.onHide();
    assert.equal(env.load('utils/draftStore.js').read().draft.data.graphObjects.length, 1);
    assert.equal(board.data.isDrawing, false);
    assert.equal(board.data.isZooming, false);
  }
});

test('the autosave timer does not interrupt an ongoing stroke', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  board.data.isDrawing = true;
  env.advance(1500);
  assert.equal(board.data.isDrawing, true);
  assert.equal(env.files.has(DRAFT_PATH), false);
  board.data.isDrawing = false;
  env.advance(1000);
  assert.equal(env.files.has(DRAFT_PATH), true);
});

test('backgrounding drains deferred canvas bounds before another board is opened', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  board.context = {};
  board.touchstart({ touches: [{ x: -100, y: -100 }] });
  assert(board.pendingCanvasBoundsData);
  board.onHide();
  assert.equal(board.pendingCanvasBoundsData, null);
  // Returning with touchend cannot replay the previous board's deferred viewport.
  board.clearMainCanvas = () => {};
  board.createNewBoard('新画板');
  env.modals.pop().success({ confirm: true });
  const viewport = { x: board.data.translateX, y: board.data.translateY };
  board.touchEnd();
  assert.deepEqual({ x: board.data.translateX, y: board.data.translateY }, viewport);
  assert.equal(board.data.canvasBounds.minX, 0);
});

test('tool changes and completed viewport gestures update an existing dirty draft', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  env.advance(1000);
  board.tinSizechange({ detail: { value: 8 } });
  board.context = {};
  board.data.scale = 0.5;
  board.touchEnd();
  env.advance(1000);
  const draft = env.load('utils/draftStore.js').read().draft;
  assert.equal(draft.data.tinctSize, 8);
  assert.equal(draft.data.scale, 0.5);
});

test('write or replacement failure leaves the previous valid draft intact and reports the failure once', () => {
  for (const step of ['write', 'rename']) {
    const env = setup();
    const board = env.createPage('jdraw');
    draw(board, 'original');
    env.advance(1000);
    const original = env.files.get(DRAFT_PATH);
    env.errors[step] = true;
    draw(board, 'new');
    env.advance(1000);
    board.flushDraft();
    assert.equal(env.files.get(DRAFT_PATH), original);
    assert.equal(env.toasts.filter(item => /草稿暂未保存/.test(item.title)).length, 1);
  }
});

test('missing images and malformed objects do not prevent recovery of valid strokes', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  board.data.graphObjects.push({ id: 'missing', type: 'image', src: '/lost/photo.jpg', x: 0, y: 0, w: 80, h: 80 }, null);
  board.onHide();
  const restored = env.createPage('jdraw');
  assert.equal(restored.data.graphObjects.length, 1);
  assert.equal(restored.data.graphObjects[0].id, 'line');
  assert(env.toasts.some(item => /部分图片或笔迹/.test(item.title)));
});

test('valid local images remain editable after restart', () => {
  const env = setup();
  env.files.set('/local/photo.jpg', 'image-data');
  const board = env.createPage('jdraw');
  board.data.graphObjects.push({ id: 'image', type: 'image', src: '/local/photo.jpg', x: -80, y: 15, w: 80, h: 60 });
  board.markChanged();
  board.onHide();
  const restored = env.createPage('jdraw');
  assert.equal(restored.data.graphObjects[0].src, '/local/photo.jpg');
  assert.equal(restored.data.canvasBounds.minX, -80);
  assert.equal(restored.data.graphObjects[0].itemBox.maxX, 80);
});

test('corrupt draft does not touch formally saved works or break startup', () => {
  const env = setup();
  env.values.set('notePaintBoardFiles', [{ id: 'saved', updatedAt: 10 }]);
  env.files.set(DRAFT_PATH, '{bad json');
  const board = env.createPage('jdraw');
  assert.equal(board.data.graphObjects.length, 0);
  assert.equal(env.values.get('notePaintBoardFiles')[0].id, 'saved');
  assert(env.toasts.some(item => /无法恢复/.test(item.title)));
});

test('successful manual save clears the recovery draft; failure keeps it', () => {
  for (const failure of [false, true]) {
    const env = setup();
    const board = env.createPage('jdraw');
    draw(board);
    env.advance(1000);
    const original = env.files.get(DRAFT_PATH);
    env.errors.setStorage = failure;
    board.generateThumbnail = done => done('');
    board.doSaveBoard();
    assert.equal(board.data.hasChanges, failure);
    if (failure) assert.equal(env.files.get(DRAFT_PATH), original);
    else assert.equal(env.load('utils/draftStore.js').read().draft, null);
  }
});

test('new strokes added during asynchronous saving remain in a draft after save completes', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board, 'first');
  let finish;
  board.generateThumbnail = callback => { finish = callback; };
  board.doSaveBoard();
  draw(board, 'second');
  finish('');
  assert.equal(board.data.hasChanges, true);
  board.onHide();
  const file = env.load('utils/boardStore.js').getFile(board.data.currentFileId);
  assert.equal(file.data.graphObjects.length, 1);
  const restored = env.createPage('jdraw');
  assert.equal(restored.data.graphObjects.length, 2);
  assert.equal(restored.data.currentFileId, file.id);
});

test('a delayed save callback cannot clear the next board or its draft', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board, 'old');
  let finish;
  board.generateThumbnail = callback => { finish = callback; };
  board.doSaveBoard();
  board.createNewBoard('新题目');
  env.modals.pop().success({ confirm: true });
  draw(board, 'new');
  env.advance(1000);
  finish('');
  assert.equal(board.data.fileName, '新题目');
  assert.equal(board.data.currentFileId, '');
  assert.equal(env.load('utils/draftStore.js').read().draft.data.graphObjects[0].id, 'new');
});

test('starting a daily topic respects cancel and clears the old draft only after confirmation', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  env.advance(1000);
  board.startDailyInspiration();
  env.modals.pop().success({ confirm: false });
  assert.equal(board.data.graphObjects.length, 1);
  assert(env.load('utils/draftStore.js').read().draft);
  board.startDailyInspiration();
  env.modals.pop().success({ confirm: true });
  env.advance(1500);
  assert.equal(board.data.graphObjects.length, 0);
  assert.equal(board.data.fileName, board.data.dailyInspiration.title);
  assert.equal(env.load('utils/draftStore.js').read().draft, null);
});

test('an explicitly selected work prompts before replacing a cold-start recovery draft', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board, 'unsaved');
  board.onHide();
  const file = env.load('utils/boardStore.js').saveFile({ name: '已有作品', data: { graphObjects: [stroke('saved')] } }).file;
  env.app.globalData.pendingFileId = file.id;
  const restored = env.createPage('jdraw');
  assert.equal(restored.data.graphObjects[0].id, 'unsaved');
  env.modals.pop().success({ confirm: true });
  assert.equal(restored.data.graphObjects[0].id, 'saved');
  assert.equal(env.load('utils/draftStore.js').read().draft, null);
});

test('a missing target work leaves the current draft intact', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  board.onHide();
  board.loadBoardFile('missing');
  assert.equal(board.data.graphObjects.length, 1);
  assert(env.load('utils/draftStore.js').read().draft);
});

test('a discarded draft stays discarded even if deleting its file fails', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  env.advance(1000);
  env.errors.unlink = true;
  board.createNewBoard();
  env.modals.pop().success({ confirm: true });
  assert(env.files.has(DRAFT_PATH));
  const restored = env.createPage('jdraw');
  assert.equal(restored.data.graphObjects.length, 0);
  assert.equal(restored.data.hasChanges, false);
});

test('discard works through a file tombstone even if small storage cannot be written', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  env.advance(1000);
  env.errors.setStorage = true;
  board.createNewBoard();
  env.modals.pop().success({ confirm: true });
  assert.equal(env.load('utils/draftStore.js').read().draft, null);
});

test('repeated new boards cannot revive an old draft when both writing and deleting files fail', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  env.advance(1000);
  env.errors.write = true;
  env.errors.unlink = true;
  board.createNewBoard();
  env.modals.pop().success({ confirm: true });
  board.createNewBoard();
  board.createNewBoard('另一题');
  const restored = env.createPage('jdraw');
  assert.equal(restored.data.graphObjects.length, 0);
  assert.equal(restored.data.hasChanges, false);
});

test('if both discard mechanisms fail, confirming a new board does not destroy current content', () => {
  const env = setup();
  const board = env.createPage('jdraw');
  draw(board);
  env.advance(1000);
  env.errors.setStorage = true;
  env.errors.write = true;
  board.createNewBoard();
  env.modals.pop().success({ confirm: true });
  assert.equal(board.data.graphObjects.length, 1);
  assert.equal(board.data.hasChanges, true);
});

test('30 unique inspirations are stable within a local day and rotate across midnight', () => {
  const env = setup();
  const inspiration = env.load('utils/dailyInspiration.js');
  assert.equal(new Set(inspiration.TOPICS).size, 30);
  const morning = inspiration.getDailyInspiration(new Date(2026, 8, 19, 0, 0));
  const evening = inspiration.getDailyInspiration(new Date(2026, 8, 19, 23, 59));
  const tomorrow = inspiration.getDailyInspiration(new Date(2026, 8, 20));
  assert.equal(morning.id, evening.id);
  assert.notEqual(morning.id, tomorrow.id);
  const board = env.createPage('jdraw');
  const before = board.data.dailyInspiration.id;
  board.dismissInspiration();
  board.onShow();
  assert.equal(board.data.inspirationDismissed, true);
  env.advance(12 * 3600 * 1000 + 100);
  assert.notEqual(board.data.dailyInspiration.id, before);
  assert.equal(board.data.inspirationDismissed, false);
});

test('Works uses the same daily topic and cleans up a failed navigation request', () => {
  const env = setup();
  const works = env.createPage('file-list');
  works.startDailyInspiration();
  assert.equal(env.app.globalData.pendingInspirationTitle, works.data.dailyInspiration.title);
  env.navigation.pop().fail();
  assert.equal(env.app.globalData.pendingFileId, '');
  works.startDailyInspiration();
  const board = env.createPage('jdraw');
  assert.equal(board.data.fileName, works.data.dailyInspiration.title);
  assert.equal(board.data.inspirationDismissed, true);
});

test('first-time tutorial remains available, but is not automatically shown over a recovered draft', () => {
  const env = setup();
  const first = env.createPage('jdraw');
  first.checkFirstTimeUser();
  env.advance(500);
  assert.equal(first.data.showTutorial, true);
  first.closeTutorial();
  draw(first);
  first.onHide();
  env.values.delete('hasUsedNotePaint');
  const restored = env.createPage('jdraw');
  restored.checkFirstTimeUser();
  env.advance(500);
  assert.equal(restored.data.showTutorial, false);
  restored.openTutorial();
  assert.equal(restored.data.showTutorial, true);
});
