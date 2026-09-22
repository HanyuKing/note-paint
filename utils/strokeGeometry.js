// Shared by the editor, thumbnails and exports so edited strokes stay identical.
const EPSILON = 1e-7;
const cache = new WeakMap();
let fragmentId = 0;
const fragmentSession = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

function distanceSquared(p, a, b) {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = dx * dx + dy * dy;
  const t = length ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / length)) : 0;
  return Math.pow(p.x - a.x - t * dx, 2) + Math.pow(p.y - a.y - t * dy, 2);
}

function bounds(points) {
  const box = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  points.forEach(p => {
    box.minX = Math.min(box.minX, p.x);
    box.minY = Math.min(box.minY, p.y);
    box.maxX = Math.max(box.maxX, p.x);
    box.maxY = Math.max(box.maxY, p.y);
  });
  return box;
}

function renderedPoints(path) {
  const points = path.points || [];
  if (!path.smooth || points.length < 3) return points;
  const previous = cache.get(points);
  if (previous && previous.length === points.length) return previous.points;
  const result = [points[0]];
  let start = points[0];
  for (let i = 1; i < points.length - 1; i++) {
    const control = points[i];
    const end = { x: (control.x + points[i + 1].x) / 2, y: (control.y + points[i + 1].y) / 2 };
    // Bound quadratic flattening error; straight segments need no subdivision.
    const bend = Math.hypot(start.x - 2 * control.x + end.x, start.y - 2 * control.y + end.y);
    const steps = Math.max(1, Math.min(128, Math.ceil(Math.sqrt(bend / 0.8))));
    for (let j = 1; j <= steps; j++) {
      const t = j / steps;
      const u = 1 - t;
      result.push({ x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
        y: u * u * start.y + 2 * u * t * control.y + t * t * end.y });
    }
    start = end;
  }
  result.push(points[points.length - 1]);
  cache.set(points, { length: points.length, points: result });
  return result;
}

function setStyle(ctx, name, value) {
  const setter = 'set' + name.charAt(0).toUpperCase() + name.slice(1);
  if (typeof ctx[setter] === 'function') ctx[setter](value);
  else ctx[name] = value;
}

function drawPath(ctx, path) {
  const points = renderedPoints(path);
  if (!points.length) return;
  const style = path.style || {};
  const x = path.x || 0;
  const y = path.y || 0;
  const width = style.width || 1;
  setStyle(ctx, 'strokeStyle', style.color || '#000000');
  setStyle(ctx, 'lineWidth', width);
  setStyle(ctx, 'lineCap', 'round');
  setStyle(ctx, 'lineJoin', 'round');
  ctx.beginPath();
  if (points.length === 1) {
    setStyle(ctx, 'fillStyle', style.color || '#000000');
    ctx.arc(points[0].x + x, points[0].y + y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  ctx.moveTo(points[0].x + x, points[0].y + y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x + x, points[i].y + y);
  ctx.stroke();
}

function hitTest(object, point, tolerance) {
  const local = { x: point.x - (object.x || 0), y: point.y - (object.y || 0) };
  if (object.type === 'image') return local.x >= 0 && local.y >= 0 && local.x <= object.w && local.y <= object.h;
  if (object.type !== 'path') return false;
  const points = renderedPoints(object);
  const radius = tolerance + ((object.style && object.style.width) || 1) / 2;
  for (let i = 0; i < points.length; i++) {
    if (distanceSquared(local, points[i], points[Math.max(0, i - 1)]) <= radius * radius) return true;
  }
  return false;
}

function at(a, b, t) {
  return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
}

// Intersections of a stroke segment with a swept circular eraser (a capsule).
function outsideIntervals(a, b, from, to, radius) {
  const cuts = [0, 1];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const aa = dx * dx + dy * dy;
  const add = t => { if (t > 0 && t < 1) cuts.push(t); };
  if (aa < EPSILON) return distanceSquared(a, from, to) >= radius * radius ? [[0, 1]] : [];
  [from, to].forEach(center => {
    const px = a.x - center.x;
    const py = a.y - center.y;
    const bb = 2 * (px * dx + py * dy);
    const cc = px * px + py * py - radius * radius;
    const discriminant = bb * bb - 4 * aa * cc;
    if (discriminant >= 0) {
      const root = Math.sqrt(discriminant);
      add((-bb - root) / (2 * aa));
      add((-bb + root) / (2 * aa));
    }
  });
  const ex = to.x - from.x;
  const ey = to.y - from.y;
  const length = Math.hypot(ex, ey);
  if (length > EPSILON) {
    const start = ((a.x - from.x) * -ey + (a.y - from.y) * ex) / length;
    const change = (dx * -ey + dy * ex) / length;
    if (Math.abs(change) > EPSILON) {
      add((radius - start) / change);
      add((-radius - start) / change);
    }
  }
  cuts.sort((a, b) => a - b);
  const outside = [];
  for (let i = 1; i < cuts.length; i++) {
    const start = cuts[i - 1];
    const end = cuts[i];
    if (end - start <= EPSILON) continue;
    if (distanceSquared(at(a, b, (start + end) / 2), from, to) >= radius * radius - EPSILON) {
      const last = outside[outside.length - 1];
      if (last && Math.abs(last[1] - start) < EPSILON) last[1] = end;
      else outside.push([start, end]);
    }
  }
  return outside;
}

function erasePath(path, start, end, radius) {
  const from = { x: start.x - (path.x || 0), y: start.y - (path.y || 0) };
  const to = { x: end.x - (path.x || 0), y: end.y - (path.y || 0) };
  const reach = radius + ((path.style && path.style.width) || 1) / 2;
  const box = path.itemBox;
  if (box && (box.maxX < Math.min(from.x, to.x) - reach || box.minX > Math.max(from.x, to.x) + reach ||
      box.maxY < Math.min(from.y, to.y) - reach || box.minY > Math.max(from.y, to.y) + reach)) return [path];
  const points = renderedPoints(path);
  if (points.length === 1) return distanceSquared(points[0], from, to) < reach * reach ? [] : [path];
  const pieces = [];
  let current = null;
  let changed = false;
  for (let i = 1; i < points.length; i++) {
    const intervals = outsideIntervals(points[i - 1], points[i], from, to, reach);
    if (intervals.length !== 1 || intervals[0][0] !== 0 || intervals[0][1] !== 1) changed = true;
    if (!intervals.length) current = null;
    intervals.forEach(interval => {
      const a = at(points[i - 1], points[i], interval[0]);
      const b = at(points[i - 1], points[i], interval[1]);
      const tail = current && current[current.length - 1];
      if (!tail || Math.hypot(a.x - tail.x, a.y - tail.y) > EPSILON) {
        current = [a];
        pieces.push(current);
      }
      if (Math.hypot(b.x - a.x, b.y - a.y) > EPSILON) current.push(b);
      if (interval[1] < 1) current = null;
    });
  }
  if (!changed) return [path];
  return pieces.map(points => Object.assign({}, path, {
    id: path.id.split('_cut_')[0] + '_cut_' + fragmentSession + '_' + (++fragmentId),
    smooth: false, points, itemBox: bounds(points)
  }));
}

function eraseObjects(objects, from, to, radius) {
  let changed = false;
  const next = [];
  objects.forEach(object => {
    const pieces = object.type === 'path' ? erasePath(object, from, to, radius) : [object];
    if (pieces.length !== 1 || pieces[0] !== object) changed = true;
    pieces.forEach(piece => next.push(piece));
  });
  return changed ? next : objects;
}

module.exports = { bounds, renderedPoints, drawPath, hitTest, eraseObjects, distanceSquared };
