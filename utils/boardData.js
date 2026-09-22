const geometry = require('./strokeGeometry');
const finite = value => typeof value === 'number' && Number.isFinite(value);

function normalizeBoard(input, checkImages) {
  const data = input && typeof input === 'object' ? input : {};
  const graphObjects = [];
  const ids = new Set();
  let dropped = 0;
  const source = Array.isArray(data.graphObjects) ? data.graphObjects : [];
  source.forEach((object, index) => {
    if (!object || !['path', 'image'].includes(object.type)) { dropped++; return; }
    const next = Object.assign({}, object, {
      id: typeof object.id === 'string' && !ids.has(object.id) ? object.id : 'recovered_' + index,
      x: finite(object.x) ? object.x : 0, y: finite(object.y) ? object.y : 0
    });
    if (object.type === 'path') {
      next.points = (Array.isArray(object.points) ? object.points : []).filter(p => p && finite(p.x) && finite(p.y));
      if (!next.points.length) { dropped++; return; }
      next.style = {
        color: object.style && typeof object.style.color === 'string' ? object.style.color : '#000000',
        width: object.style && finite(object.style.width) && object.style.width > 0 ? object.style.width : 3
      };
      next.itemBox = geometry.bounds(next.points);
    } else {
      if (!object.src || !finite(object.w) || !finite(object.h) || object.w <= 0 || object.h <= 0) { dropped++; return; }
      if (checkImages && typeof wx.getFileSystemManager === 'function') {
        try { wx.getFileSystemManager().accessSync(object.src); }
        catch (e) { dropped++; return; }
      }
      next.itemBox = { minX: 0, minY: 0, maxX: object.w, maxY: object.h };
    }
    ids.add(next.id);
    graphObjects.push(next);
  });
  const original = data.canvasBounds || {};
  const bounds = {
    minX: finite(original.minX) ? original.minX : 0, minY: finite(original.minY) ? original.minY : 0,
    maxX: finite(original.maxX) ? original.maxX : 800, maxY: finite(original.maxY) ? original.maxY : 1000
  };
  graphObjects.forEach(object => {
    bounds.minX = Math.min(bounds.minX, object.x + object.itemBox.minX);
    bounds.minY = Math.min(bounds.minY, object.y + object.itemBox.minY);
    bounds.maxX = Math.max(bounds.maxX, object.x + object.itemBox.maxX);
    bounds.maxY = Math.max(bounds.maxY, object.y + object.itemBox.maxY);
  });
  bounds.maxX = Math.max(bounds.minX + 1, bounds.maxX);
  bounds.maxY = Math.max(bounds.minY + 1, bounds.maxY);
  return { dropped, data: {
    graphObjects, canvasBounds: bounds,
    canvasWidth: bounds.maxX - bounds.minX, canvasHeight: bounds.maxY - bounds.minY,
    scale: finite(data.scale) ? Math.max(0.05, Math.min(20, data.scale)) : 1,
    translateX: finite(data.translateX) ? data.translateX : 0,
    translateY: finite(data.translateY) ? data.translateY : 0,
    brushState: data.brushState === 'c' ? 'c' : 'p', currentMode: data.currentMode === 'select' ? 'select' : 'draw',
    tinctCurr: Number.isInteger(data.tinctCurr) && data.tinctCurr >= -1 && data.tinctCurr < 12 ? data.tinctCurr : 0,
    tinctSize: finite(data.tinctSize) ? Math.max(1, Math.min(10, data.tinctSize)) : 3,
    eraserSize: finite(data.eraserSize) ? Math.max(8, Math.min(80, data.eraserSize)) : 20,
    customColor: typeof data.customColor === 'string' ? data.customColor : ''
  } };
}

module.exports = { normalizeBoard };
