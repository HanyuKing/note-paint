const test = require('node:test');
const assert = require('node:assert/strict');
const geometry = require('../utils/strokeGeometry');
const { setup, copy } = require('./helpers/drawing-env');

function recordingContext() {
  const calls = [];
  const ctx = { calls };
  for (const name of ['clearRect', 'fillRect', 'save', 'restore', 'scale', 'translate', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'arc', 'fill', 'drawImage', 'strokeRect', 'setTransform']) {
    ctx[name] = (...args) => calls.push([name, ...args]);
  }
  return ctx;
}

function touch(x, y) { return { touches: [{ x, y }] }; }
function boardFor(env) {
  const board = env.createPage('jdraw');
  board.context = recordingContext();
  return board;
}
function draw(board, points) {
  board.touchstart(touch(...points[0]));
  points.slice(1).forEach(point => board.touchMove(touch(...point)));
  board.touchEnd();
}
function path(points, extra) {
  return Object.assign({ id: 'path', type: 'path', x: 0, y: 0, points,
    itemBox: geometry.bounds(points), style: { color: 'rgba(20, 30, 40, 0.5)', width: 4 } }, extra);
}

test('smoothing preserves endpoints, removes sharp joins, and never changes legacy paths', () => {
  const points = [{ x: 0, y: 0 }, { x: 40, y: 60 }, { x: 80, y: 0 }];
  const legacy = path(points);
  assert.equal(geometry.renderedPoints(legacy), points);
  const smooth = geometry.renderedPoints(path(points, { smooth: true }));
  assert.deepEqual(smooth[0], points[0]);
  assert.deepEqual(smooth.at(-1), points.at(-1));
  assert(smooth.length > 3);
  assert(Math.max(...smooth.map(point => point.y)) < 60);
  assert.equal(geometry.hitTest(legacy, { x: 5, y: 55 }, 1), false);
});

test('a single tap produces a visible dot, which can be erased', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[50, 50]]);
  assert(board.context.calls.some(call => call[0] === 'arc'));
  const before = copy(board.data.graphObjects);
  board.switchBrush({ currentTarget: { dataset: { state: 'c' } } });
  draw(board, [[50, 50]]);
  assert.equal(board.data.graphObjects.length, 0);
  board.drawBack();
  assert.deepEqual(copy(board.data.graphObjects), before);
  board.drawRedo();
  assert.equal(board.data.graphObjects.length, 0);
});

test('swept eraser cuts long sparse paths, accounts for object translation, and leaves images intact', () => {
  const stroke = path([{ x: 0, y: 0 }, { x: 200, y: 0 }], { x: 20, y: 40 });
  const photo = { id: 'photo', type: 'image', src: '/local/photo.jpg', x: 0, y: 0, w: 200, h: 100 };
  const original = JSON.stringify(stroke);
  const result = geometry.eraseObjects([photo, stroke], { x: 120, y: 0 }, { x: 120, y: 80 }, 8);
  assert.equal(result.length, 3);
  assert.equal(result[0], photo);
  assert.equal(result[1].points.at(-1).x, 90);
  assert(Math.abs(result[2].points[0].x - 110) < 1e-7);
  assert.equal(JSON.stringify(stroke), original);
  assert.notEqual(result[1].id, result[2].id);
  assert.equal(geometry.hitTest(result[1], { x: 120, y: 40 }, 1), false);
});

test('an eraser miss preserves path identity and smoothing; a hit does not re-smooth remaining pieces', () => {
  const stroke = path([{ x: 0, y: 0 }, { x: 50, y: 50 }, { x: 100, y: 0 }], { smooth: true });
  const objects = [stroke];
  assert.equal(geometry.eraseObjects(objects, { x: 200, y: 200 }, { x: 220, y: 220 }, 10), objects);
  const fragments = geometry.eraseObjects(objects, { x: 50, y: -50 }, { x: 50, y: 100 }, 5);
  assert.equal(fragments.length, 2);
  assert(fragments.every(fragment => fragment.smooth === false));
});

test('draw, erase, move and delete each form one reversible operation', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[20, 80], [100, 80], [180, 80]]);
  const original = copy(board.data.graphObjects);
  board.switchBrush({ currentTarget: { dataset: { state: 'c' } } });
  draw(board, [[100, 50], [100, 110]]);
  assert.equal(board.data.graphObjects.length, 2);
  const erased = copy(board.data.graphObjects);
  board.switchMode({ currentTarget: { dataset: { mode: 'select' } } });
  draw(board, [[40, 80], [40, 100], [50, 120]]);
  const moved = copy(board.data.graphObjects);
  assert.equal(moved[0].x, 10);
  assert.equal(moved[0].y, 40);
  board.deleteSelected();
  assert.equal(board.data.graphObjects.length, 1);
  board.drawBack();
  assert.deepEqual(copy(board.data.graphObjects), moved);
  board.drawBack();
  assert.deepEqual(copy(board.data.graphObjects), erased);
  board.drawBack();
  assert.deepEqual(copy(board.data.graphObjects), original);
  board.drawBack();
  assert.equal(board.data.graphObjects.length, 0);
  assert.equal(board.data.canUndo, false);
  for (let i = 0; i < 4; i++) board.drawRedo();
  assert.equal(board.data.graphObjects.length, 1);
  assert.equal(board.data.canRedo, false);
});

test('selection and eraser misses preserve redo; a new edit discards redo', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[20, 20], [80, 20]]);
  draw(board, [[20, 80], [80, 80]]);
  board.drawBack();
  board.switchMode({ currentTarget: { dataset: { mode: 'select' } } });
  draw(board, [[40, 20]]);
  assert.equal(board.data.canRedo, true);
  board.switchBrush({ currentTarget: { dataset: { state: 'c' } } });
  draw(board, [[200, 200], [220, 220]]);
  assert.equal(board.data.canRedo, true);
  board.switchBrush({ currentTarget: { dataset: { state: 'p' } } });
  draw(board, [[30, 30], [90, 30]]);
  assert.equal(board.data.canRedo, false);
});

test('moving and deleting a photo can be undone; clear is also reversible', () => {
  const env = setup();
  const board = boardFor(env);
  board.data.graphObjects = [{ id: 'photo', type: 'image', src: '/local/photo.jpg', x: 30, y: 40,
    w: 80, h: 60, itemBox: { minX: 0, minY: 0, maxX: 80, maxY: 60 } }];
  board.switchMode({ currentTarget: { dataset: { mode: 'select' } } });
  draw(board, [[60, 60], [90, 100]]);
  assert.equal(board.data.graphObjects[0].x, 60);
  board.deleteSelected();
  board.drawBack();
  board.drawBack();
  assert.equal(board.data.graphObjects[0].x, 30);
  board.doClearCanvas();
  assert.equal(board.data.graphObjects.length, 0);
  board.drawBack();
  assert.equal(board.data.graphObjects[0].id, 'photo');
});

test('pinching commits a pending stroke once, zooms around the midpoint and ignores the remaining finger', () => {
  const env = setup();
  const board = boardFor(env);
  board.touchstart(touch(10, 50));
  board.touchMove(touch(50, 50));
  board.touchstart({ touches: [{ x: 50, y: 50 }, { x: 150, y: 50 }] });
  board.touchMove({ touches: [{ x: 10, y: 60 }, { x: 210, y: 60 }] });
  assert.equal(board.data.scale, 2);
  assert.equal(board.data.translateX, -90);
  assert.equal(board.data.translateY, -40);
  board.touchEnd({ touches: [{ x: 10, y: 60 }] });
  board.touchMove(touch(100, 100));
  assert.equal(board.data.graphObjects.length, 1);
  board.touchEnd({ touches: [] });
  board.drawBack();
  assert.equal(board.data.graphObjects.length, 0);
});

test('iPhone left-edge back gesture cancels the in-progress stroke before a long vertical move', () => {
  const env = setup();
  const board = boardFor(env);
  board.touchstart({ touches: [{ identifier: 7, x: 3, y: 360 }] });
  board.touchMove({ touches: [{ identifier: 7, x: 8, y: 359 }] });
  board.touchMove({ touches: [{ identifier: 7, x: 22, y: 358 }] });
  assert.equal(board.ignoreSingleTouch, true);
  assert.equal(board.data.graphObjects.length, 0);
  board.touchMove({ touches: [{ identifier: 7, x: 22, y: 20 }] });
  board.touchCancel({ changedTouches: [{ identifier: 7, x: 22, y: -900 }] });
  assert.equal(board.data.graphObjects.length, 0);
  assert.equal(board.data.isDrawing, false);
  assert.equal(board.touchSession, null);
});

test('touchcancel never appends its changedTouches coordinate and rolls back drawing, erasing, and moving', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[40, 40], [80, 80]]);
  const original = copy(board.data.graphObjects);

  board.touchstart({ touches: [{ identifier: 1, x: 120, y: 120 }] });
  board.touchMove({ touches: [{ identifier: 1, x: 160, y: 160 }] });
  board.touchCancel({ changedTouches: [{ identifier: 1, x: 160, y: -1000 }] });
  assert.deepEqual(copy(board.data.graphObjects), original);

  board.switchBrush({ currentTarget: { dataset: { state: 'c' } } });
  board.touchstart({ touches: [{ identifier: 2, x: 60, y: 60 }] });
  board.touchMove({ touches: [{ identifier: 2, x: 70, y: 70 }] });
  board.touchCancel({ changedTouches: [{ identifier: 2, x: 70, y: -1000 }] });
  assert.deepEqual(copy(board.data.graphObjects), original);

  board.switchMode({ currentTarget: { dataset: { mode: 'select' } } });
  board.touchstart({ touches: [{ identifier: 3, x: 55, y: 55 }] });
  board.touchMove({ touches: [{ identifier: 3, x: 100, y: 100 }] });
  board.touchCancel({ changedTouches: [{ identifier: 3, x: 100, y: -1000 }] });
  assert.deepEqual(copy(board.data.graphObjects), original);
  assert.equal(board.data.isDraggingObject, false);
  assert.equal(board.editBefore, null);
});

test('normal touchend keeps the last received move but ignores an anomalous changedTouches point', () => {
  const env = setup();
  const board = boardFor(env);
  board.touchstart({ touches: [{ x: 20, y: 20 }] });
  board.touchMove({ touches: [{ x: 80, y: 80 }] });
  board.touchEnd({ changedTouches: [{ x: 80, y: -1000 }], touches: [] });
  const points = board.data.graphObjects[0].points;
  assert.deepEqual(copy(points.map(point => [point.x, point.y])), [[20, 20], [80, 80]]);
});

test('page hiding commits received points without appending an unknown end coordinate', () => {
  const env = setup();
  const board = boardFor(env);
  board.touchstart({ touches: [{ x: 20, y: 20 }] });
  board.touchMove({ touches: [{ x: 80, y: 80 }] });
  board.onHide();
  assert.deepEqual(copy(board.data.graphObjects[0].points.map(point => [point.x, point.y])), [[20, 20], [80, 80]]);
  assert.equal(board.data.isDrawing, false);
  assert.equal(board.touchSession, null);
});

test('returning after an edge-back cancellation accepts the next normal touch', () => {
  const env = setup();
  const board = boardFor(env);
  board.touchstart({ touches: [{ x: 3, y: 200 }] });
  board.touchMove({ touches: [{ x: 22, y: 200 }] });
  assert.equal(board.ignoreSingleTouch, true);
  board.onShow();
  board.touchstart({ touches: [{ x: 120, y: 120 }] });
  board.touchMove({ touches: [{ x: 160, y: 160 }] });
  board.touchEnd();
  assert.equal(board.data.graphObjects.length, 1);
  assert.equal(board.data.graphObjects[0].points.length, 2);
});

test('history button and help text use Photoshop-style 还原 / 重做 wording', () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const root = path.join(__dirname, '..');
  const editor = fs.readFileSync(path.join(root, 'page/component/jdraw/jdraw.wxml'), 'utf8');
  const guide = fs.readFileSync(path.join(root, 'components/drawing-guide/index.wxml'), 'utf8');
  const help = fs.readFileSync(path.join(root, 'page/component/help/help.wxml'), 'utf8');
  assert.match(editor, />还原<\/text>/);
  assert.match(editor, /aria-label="还原最近一次操作"/);
  assert.match(editor, />重做<\/text>/);
  assert.match(guide, /还原：撤回刚刚的操作；重做：重新执行刚刚还原的操作/);
  assert.match(help, /还原与重做/);
  assert.doesNotMatch(editor, />撤销<\/text>/);
});

test('frame rendering clears previous ink so translucent strokes do not darken with each move', () => {
  const env = setup();
  const board = boardFor(env);
  board.data.tinctCurr = -1;
  board.data.customColor = 'rgba(10, 20, 30, 0.3)';
  board.touchstart(touch(20, 20));
  for (let i = 1; i <= 5; i++) {
    board.touchMove(touch(20 + i * 10, 20 + i * 5));
    env.advance(16);
  }
  board.touchEnd();
  const calls = board.context.calls;
  const strokes = calls.map((call, index) => call[0] === 'stroke' ? index : -1).filter(index => index >= 0);
  let previous = -1;
  strokes.forEach(index => {
    assert(calls.slice(previous + 1, index).some(call => call[0] === 'clearRect'));
    previous = index;
  });
  assert.equal(board.data.graphObjects[0].style.color, board.data.customColor);
});

test('editor export and Works export render identical smoothed and erased geometry, without selection', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[20, 50], [80, 100], [140, 50], [200, 80]]);
  board.switchBrush({ currentTarget: { dataset: { state: 'c' } } });
  draw(board, [[100, 0], [100, 150]]);
  board.data.activeObjectId = board.data.graphObjects[0].id;
  const editorContext = recordingContext();
  const worksContext = recordingContext();
  board.renderToContext(editorContext, 800, 1000, 1, 0, 0, true, { x: 0, y: 0 });
  const works = env.createPage('file-list');
  works.renderBoardToContext(worksContext, board.buildBoardData(), 800, 1000, 1, 0, 0);
  assert.deepEqual(editorContext.calls, worksContext.calls);
  assert(!editorContext.calls.some(call => call[0] === 'strokeRect'));
});

test('a save callback during the next unfinished stroke cannot mark that stroke saved', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[20, 20], [80, 80]]);
  let finish;
  board.generateThumbnail = done => { finish = done; };
  board.doSaveBoard();
  board.touchstart(touch(100, 100));
  board.touchMove(touch(150, 150));
  finish('');
  assert.equal(board.data.hasChanges, true);
  assert.equal(board.data.isDrawing, true);
  board.onHide();
  const saved = env.load('utils/boardStore.js').getFile(board.data.currentFileId);
  assert.equal(saved.data.graphObjects.length, 1);
  const recovered = env.createPage('jdraw');
  assert.equal(recovered.data.graphObjects.length, 2);
});

test('erasing everything still saves an empty recovery draft linked to the existing work', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[40, 40]]);
  board.generateThumbnail = done => done('');
  board.doSaveBoard();
  const id = board.data.currentFileId;
  board.switchBrush({ currentTarget: { dataset: { state: 'c' } } });
  draw(board, [[40, 40]]);
  board.onHide();
  const recovered = env.createPage('jdraw');
  assert.equal(recovered.data.currentFileId, id);
  assert.equal(recovered.data.graphObjects.length, 0);
  assert.equal(recovered.data.hasChanges, true);
  assert.equal(env.load('utils/boardStore.js').getFile(id).data.graphObjects.length, 1);
});

test('a discarded board ignores delayed image insertion, and image persistence failure does not insert a temporary image', () => {
  for (const discarded of [false, true]) {
    const env = setup();
    const board = boardFor(env);
    env.wx.chooseImage = options => options.success({ tempFilePaths: ['/temp/photo'] });
    env.wx.getImageInfo = options => options.success({ width: 200, height: 100 });
    let complete;
    env.wx.saveFile = options => { complete = options; };
    board.chooseImage();
    if (discarded) {
      board.applyEmptyBoard();
      complete.success({ savedFilePath: '/local/photo' });
    } else complete.fail();
    assert.equal(board.data.graphObjects.length, 0);
  }
});

test('history is capped at 60 operations and a document switch clears both stacks', () => {
  const env = setup();
  const board = boardFor(env);
  for (let i = 0; i < 65; i++) draw(board, [[20 + i, 20]]);
  for (let i = 0; i < 65; i++) board.drawBack();
  assert.equal(board.data.graphObjects.length, 5);
  assert.equal(board.data.canRedo, true);
  board.applyEmptyBoard();
  assert.equal(board.data.canUndo, false);
  assert.equal(board.data.canRedo, false);
});

test('image decoding is shared across frames and failed images do not trigger endless reloads', () => {
  const env = setup();
  const board = boardFor(env);
  let created = 0;
  let image;
  board.mainCanvas = { createImage() { created++; image = {}; return image; } };
  const results = [];
  board.getImageDrawSource('/photo', value => results.push(value));
  board.getImageDrawSource('/photo', value => results.push(value));
  assert.equal(created, 1);
  image.onload();
  assert.equal(results.length, 2);
  assert.equal(results[0], image);
  board.getImageDrawSource('/photo', value => results.push(value));
  assert.equal(created, 1);
  board.getImageDrawSource('/bad', () => {});
  image.onerror();
  board.getImageDrawSource('/bad', value => assert.equal(value, ''));
  assert.equal(created, 2);
});

test('loading another work releases a pending save, and late ad completion cannot save the wrong board', () => {
  const env = setup();
  const board = boardFor(env);
  draw(board, [[20, 20], [80, 80]]);
  let finish;
  board.generateThumbnail = done => { finish = done; };
  board.doSaveBoard();
  const file = env.load('utils/boardStore.js').saveFile({ name: 'another', data: { graphObjects: [] } }).file;
  board.loadBoardFile(file.id);
  assert.equal(board.data.isSavingBoard, false);
  finish('');
  assert.equal(board.data.currentFileId, file.id);
  let adFinished;
  let saved = false;
  board.saveFileAd = { show(done) { adFinished = done; } };
  board.requireSaveFileAd(() => { saved = true; });
  board.applyEmptyBoard();
  adFinished(true);
  assert.equal(saved, false);
});
