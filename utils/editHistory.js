// Objects are immutable once an operation completes; snapshots share their points.
function createHistory(limit) {
  const undo = [];
  const redo = [];
  return {
    push(before, after) {
      if (before.objects.length === after.objects.length && before.objects.every((object, i) => object === after.objects[i])) return false;
      undo.push({ before, after });
      if (undo.length > (limit || 60)) undo.shift();
      redo.length = 0;
      return true;
    },
    undo() {
      const operation = undo.pop();
      if (!operation) return null;
      redo.push(operation);
      return operation.before;
    },
    redo() {
      const operation = redo.pop();
      if (!operation) return null;
      undo.push(operation);
      return operation.after;
    },
    state() { return { canUndo: undo.length > 0, canRedo: redo.length > 0 }; }
  };
}

module.exports = { createHistory };
