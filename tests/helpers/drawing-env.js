const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ROOT = path.join(__dirname, '../..');
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

module.exports = { setup, copy, DRAFT_PATH };
