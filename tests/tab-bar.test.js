const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function setup() {
  let time = 10000;
  let timerId = 0;
  const timers = new Map();
  const navigation = [];
  const toasts = [];
  let currentPage = { route: 'page/component/jdraw/jdraw', data: {} };
  const module = { exports: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../utils/tabBarMotion.js'), 'utf8'), {
    module, Date: { now: () => time }
  });
  let definition;
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../custom-tab-bar/index.js'), 'utf8'), {
    require: () => module.exports,
    Component: value => definition = value,
    getCurrentPages: () => [currentPage],
    Date: { now: () => time },
    wx: {
      switchTab: options => navigation.push(options),
      showToast: options => toasts.push(options)
    },
    setTimeout(callback, delay) {
      const id = ++timerId;
      timers.set(id, { callback, due: time + delay });
      return id;
    },
    clearTimeout: id => timers.delete(id)
  });
  function advance(ms) {
    const until = time + ms;
    while (true) {
      const next = [...timers.entries()].filter(([, timer]) => timer.due <= until)
        .sort((a, b) => a[1].due - b[1].due)[0];
      if (!next) break;
      time = next[1].due;
      timers.delete(next[0]);
      next[1].callback();
    }
    time = until;
  }
  function create(index) {
    const bar = Object.assign({}, definition.methods, {
      data: JSON.parse(JSON.stringify(definition.data)),
      updates: [],
      setData(patch, callback) {
        this.updates.push(patch);
        Object.assign(this.data, patch);
        if (callback) callback();
      },
      createSelectorQuery() {
        const query = {
          select: () => query,
          boundingClientRect(callback) {
            callback({ left: 12, width: 300 });
            return query;
          },
          exec() {}
        };
        return query;
      }
    });
    definition.lifetimes.attached.call(bar);
    currentPage = {
      route: index === undefined ? currentPage.route : bar.data.list[index].pagePath.slice(1),
      data: {},
      getTabBar: () => bar
    };
    if (index !== undefined) bar.syncActiveTab(index, false);
    return bar;
  }
  return {
    create, advance, navigation, toasts,
    setCurrent(index, bar) {
      currentPage = { route: bar.data.list[index].pagePath.slice(1), data: {}, getTabBar: () => bar };
    },
    show: bar => definition.pageLifetimes.show.call(bar),
    ready: bar => definition.lifetimes.ready.call(bar),
    hide: bar => definition.pageLifetimes.hide.call(bar),
    detach: bar => definition.lifetimes.detached.call(bar)
  };
}

function tap(bar, index) {
  bar.switchTab({ currentTarget: { dataset: { index } } });
}

function touch(index, x, y = 800) {
  return { currentTarget: { dataset: { index } }, touches: [{ clientX: x, clientY: y }] };
}

test('component ready fills in the first selection if page onShow ran too early', () => {
  const env = setup();
  const board = env.create();
  assert.equal(board.data.ready, false);
  env.ready(board);
  assert.equal(board.data.ready, true);
  assert.equal(board.data.selected, 0);
});

test('a late ready event on an inactive component cannot claim the current route', () => {
  const env = setup();
  const board = env.create();
  env.hide(board);
  const count = board.updates.length;
  env.ready(board);
  assert.equal(board.updates.length, count);
  assert.equal(board.data.ready, false);
});

test('tap navigates immediately and the destination continues from the previous tab', () => {
  const env = setup();
  const source = env.create(0);
  tap(source, 2);
  assert.equal(env.navigation[0].url, '/page/component/mine/mine');
  env.hide(source);
  const target = env.create(2);
  assert.equal(target.data.selected, 2);
  assert.equal(target.data.lensPosition, 2);
  assert.equal(target.data.arrivalOffset, -200);
  assert.equal(target.data.arriving, true);
  assert.equal(target.data.motionEnabled, false);
  env.advance(24);
  assert.equal(target.data.lensPosition, 2);
  assert.equal(target.data.settling, true);
  env.advance(460);
  assert.equal(target.data.settling, false);
});

test('returning to a cached tab animates from the outgoing tab instead of flashing at zero', () => {
  const env = setup();
  const board = env.create(0);
  tap(board, 2);
  env.hide(board);
  const mine = env.create(2);
  env.advance(500);
  tap(mine, 0);
  env.hide(mine);
  board.syncActiveTab(0, false);
  assert.equal(board.data.selected, 0);
  assert.equal(board.data.lensPosition, 0);
  assert.equal(board.data.arrivalOffset, 200);
  env.advance(24);
  assert.equal(board.data.lensPosition, 0);
});

test('programmatic navigation animates once, returning from a secondary page does not replay it', () => {
  const env = setup();
  const board = env.create(0);
  env.hide(board);
  const works = env.create(1);
  assert.equal(works.data.lensPosition, 1);
  assert.equal(works.data.arrivalOffset, -100);
  env.advance(500);
  env.hide(works);
  works.syncActiveTab(1, false);
  assert.equal(works.data.lensPosition, 1);
  assert.equal(works.data.settling, false);
});

test('drag previews without navigating, then hands its fractional position to the destination', () => {
  const env = setup();
  const board = env.create(0);
  board.onTouchStart(touch(0, 62));
  board.onTouchMove(touch(0, 192));
  assert.equal(board.data.previewIndex, 1);
  assert.equal(board.data.selected, 0);
  assert.equal(env.navigation.length, 0);
  board.onTouchEnd();
  assert.equal(env.navigation[0].url, '/page/component/file-list/file-list');
  env.navigation[0].success();
  tap(board, 0);
  assert.equal(env.navigation.length, 1, 'synthetic tap must not undo the drag');
  env.hide(board);
  const works = env.create(1);
  assert.equal(works.data.lensPosition, 1);
  assert(Math.abs(works.data.arrivalOffset - 30) < 0.001);
  env.advance(24);
  assert.equal(works.data.lensPosition, 1);
});

test('edge dragging stays bounded and springs back without navigating', () => {
  const env = setup();
  const board = env.create(0);
  board.onTouchStart(touch(0, 62));
  board.onTouchMove(touch(0, -200));
  assert(board.data.lensPosition >= -0.12);
  board.onTouchEnd();
  assert.equal(env.navigation.length, 0);
  assert.equal(board.data.lensPosition, 0);
  assert.equal(board.data.settling, true);
});

test('cancelled, vertical and multi-touch gestures never navigate', () => {
  for (const mode of ['cancel', 'vertical', 'multi']) {
    const env = setup();
    const board = env.create(0);
    board.onTouchStart(touch(0, 62));
    if (mode === 'vertical') {
      board.onTouchMove(touch(0, 64, 825));
    } else {
      board.onTouchMove(touch(0, 192));
      if (mode === 'cancel') board.cancelTouch();
      else board.onTouchMove({ touches: [{ clientX: 192, clientY: 800 }, { clientX: 195, clientY: 800 }] });
    }
    board.onTouchEnd();
    tap(board, 1);
    assert.equal(env.navigation.length, 0);
    assert.equal(board.data.previewIndex, 0);
    assert.equal(board.data.lensPosition, 0);
    assert.equal(board.data.pressed, false);
  }
});

test('a new touch can tap immediately after a cancelled drag', () => {
  const env = setup();
  const board = env.create(0);
  board.onTouchStart(touch(0, 62));
  board.onTouchMove(touch(0, 192));
  board.cancelTouch();
  board.onTouchStart(touch(1, 162));
  board.onTouchEnd();
  tap(board, 1);
  assert.equal(env.navigation.length, 1);
});

test('navigation failure restores the current selection and discards the handoff', () => {
  const env = setup();
  const board = env.create(0);
  board.onTouchStart(touch(0, 62));
  board.onTouchMove(touch(0, 192));
  board.onTouchEnd();
  env.navigation[0].fail();
  assert.equal(board.data.selected, 0);
  assert.equal(board.data.previewIndex, 0);
  assert.equal(board.data.lensPosition, 0);
  assert.equal(env.toasts.length, 1);
  const works = env.create(1);
  assert.equal(works.data.lensPosition, 1);
  assert.equal(works.data.arrivalOffset, -100, 'failed drag must not leave a stale fractional origin');
});

test('rapid taps cannot issue competing navigations', () => {
  const env = setup();
  const board = env.create(0);
  tap(board, 1);
  tap(board, 2);
  assert.equal(env.navigation.length, 1);
  assert.equal(env.navigation[0].url, '/page/component/file-list/file-list');
});

test('hiding for the color picker cancels an unfinished arrival and restores the correct lens', () => {
  const env = setup();
  const mine = env.create(2);
  mine.setHidden(true);
  mine.setHidden(false);
  env.advance(1000);
  assert.equal(mine.data.lensPosition, 2);
  assert.equal(mine.data.previewIndex, 2);
  assert.equal(mine.data.pressed, false);
  assert.equal(mine.data.settling, false);
});

test('hidden or detached components receive no delayed animation updates', () => {
  for (const lifecycle of ['hide', 'detach']) {
    const env = setup();
    const mine = env.create(2);
    env[lifecycle](mine);
    const count = mine.updates.length;
    env.advance(1000);
    assert.equal(mine.updates.length, count);
  }
});

test('an outdated render callback cannot restart animation after hiding the bar', () => {
  const env = setup();
  const board = env.create(0);
  let callback;
  const setData = board.setData;
  board.setData = function (patch, done) {
    setData.call(this, patch);
    if (done) callback = done;
  };
  board.syncActiveTab(2, false);
  board.setHidden(true);
  const count = board.updates.length;
  callback();
  env.advance(1000);
  assert.equal(board.updates.length, count);
  assert.equal(board.data.lensPosition, 2);
});

test('destination position is correct even when its render callback never arrives', () => {
  const env = setup();
  const mine = env.create(2);
  env.advance(500);
  tap(mine, 1);
  env.hide(mine);
  const works = env.create();
  const setData = works.setData;
  works.setData = function (patch) { setData.call(this, patch); };
  env.setCurrent(1, works);
  works.syncActiveTab(1, false);
  assert.equal(works.data.selected, 1);
  assert.equal(works.data.lensPosition, 1);
  assert.equal(works.data.arrivalOffset, 100);
  env.advance(1000);
  assert.equal(works.data.lensPosition, 1);
});

test('tapping Works from Mine uses the actual route despite stale cached selection', () => {
  const env = setup();
  const mine = env.create(2);
  env.advance(500);
  mine.setData({ selected: 1, previewIndex: 1, lensPosition: 1 });
  tap(mine, 1);
  assert.equal(env.navigation.length, 1);
  assert.equal(env.navigation[0].url, '/page/component/file-list/file-list');
});

test('component show revives a cached tab even if the page did not synchronize its bar', () => {
  const env = setup();
  const works = env.create(1);
  env.hide(works);
  const mine = env.create(2);
  env.advance(500);
  env.hide(mine);
  env.setCurrent(1, works);
  env.show(works);
  assert.equal(works.data.selected, 1);
  assert.equal(works.data.lensPosition, 1);
  tap(works, 2);
  assert.equal(env.navigation[0].url, '/page/component/mine/mine');
});

test('duplicate show events and a press cannot leave the lens at the previous tab', () => {
  const env = setup();
  env.create(2);
  const works = env.create(1);
  const offset = works.data.arrivalOffset;
  env.show(works);
  assert.equal(works.data.arrivalOffset, offset);
  works.onTouchStart(touch(1, 162));
  assert.equal(works.data.lensPosition, 1);
  assert.equal(works.data.arriving, false);
  works.onTouchEnd();
  tap(works, 1);
  assert.equal(works.data.lensPosition, 1);
  assert.equal(env.navigation.length, 0);
});

test('missing native navigation callbacks cannot lock the bar indefinitely', () => {
  const env = setup();
  const mine = env.create(2);
  env.advance(500);
  tap(mine, 1);
  env.advance(2001);
  tap(mine, 0);
  assert.equal(env.navigation.length, 2);
  assert.equal(env.navigation[1].url, '/page/component/jdraw/jdraw');
});

test('touches with page coordinates still select the correct destination', () => {
  const env = setup();
  const board = env.create(0);
  const start = { currentTarget: { dataset: { index: 0 } }, touches: [{ pageX: 62, pageY: 800 }] };
  board.onTouchStart(start);
  board.onTouchMove({ touches: [{ pageX: 192, pageY: 800 }] });
  board.onTouchEnd();
  assert.equal(env.navigation[0].url, '/page/component/file-list/file-list');
});

test('page startup continues with a cached bar that only supports setData', () => {
  for (const [index, name] of ['jdraw', 'file-list', 'mine'].entries()) {
    let page;
    let continuation = false;
    const bar = { data: {}, setData(value) { Object.assign(this.data, value); } };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../page/component/' + name + '/' + name + '.js'), 'utf8'), {
      require: () => ({}),
      Page: value => page = value
    });
    page.data = Object.assign({}, page.data);
    page.getTabBar = () => bar;
    page.consumePendingFileId = () => { continuation = true; };
    page.refreshFiles = () => { continuation = true; };
    page.onShow();
    assert.equal(bar.data.selected, index);
    assert.equal(bar.data.lensPosition, index);
    if (index < 2) assert.equal(continuation, true);
  }
});
