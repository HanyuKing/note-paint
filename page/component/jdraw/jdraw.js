const boardStore = require('../../../utils/boardStore');

function toHex(n) {
  const h = Math.max(0, Math.min(255, Math.round(n))).toString(16);
  return h.length < 2 ? '0' + h : h;
}

function hslToHex(h, s, l) {
  s = s / 100;
  l = l / 100;
  const a = s * Math.min(l, 1 - l);
  const f = function (n) {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return toHex(color * 255);
  };
  return '#' + f(0) + f(8) + f(4);
}

function hexToHsl(hex) {
  if (!hex || hex.charAt(0) !== '#') return { h: 0, s: 0, l: 50 };
  let v = hex.slice(1);
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  if (v.length !== 6) return { h: 0, s: 0, l: 50 };
  const r = parseInt(v.slice(0, 2), 16) / 255;
  const g = parseInt(v.slice(2, 4), 16) / 255;
  const b = parseInt(v.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = (g - b) / d + (g < b ? 6 : 0); break;
      case g: h = (b - r) / d + 2; break;
      case b: h = (r - g) / d + 4; break;
    }
    h *= 60;
  }
  return {
    h: Math.round(h),
    s: Math.round(s * 100),
    l: Math.round(l * 100)
  };
}

Page({
  data: {
    graphObjects: [],
    currentMode: 'draw',
    activeObjectId: null,

    brushState: 'p',
    tinctList: [
      '#000000',
      '#EF4444',
      '#F59E0B',
      '#FBBF24',
      '#10B981',
      '#3B82F6',
      '#2563EB',
      '#6366F1',
      '#8B5CF6',
      '#92400E',
      '#9CA3AF',
      '#FFFFFF'
    ],
    primaryColors: [
      { index: 0, value: '#000000' },
      { index: 1, value: '#EF4444' },
      { index: 2, value: '#F59E0B' },
      { index: 4, value: '#10B981' },
      { index: 5, value: '#3B82F6' },
      { index: 8, value: '#8B5CF6' }
    ],
    tinctCurr: 0,
    tinctSize: 3,
    customColor: '',

    showColorPicker: false,
    pickerHue: 0,
    pickerLight: 50,
    pickerColor: '#000000',

    canvasWidth: 800,
    canvasHeight: 1000,
    scale: 1,
    translateX: 0,
    translateY: 0,

    isDrawing: false,
    isPanning: false,
    isZooming: false,
    lastTouchDistance: 0,
    lastPanPoint: null,

    canvasBounds: { minX: 0, maxX: 800, minY: 0, maxY: 1000 },

    showTutorial: false,
    showScaleToast: false,
    scalePercent: 100,

    currentFileId: '',
    fileName: '',
    hasChanges: false,
    isSavingBoard: false,
    isExportingImage: false,

    exportWidth: 0,
    exportHeight: 0
  },

  onLoad() {
    this.consumePendingFileId(true);
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 0 });
    }
    this.consumePendingFileId(false);
  },

  onReady() {
    this.context = wx.createCanvasContext('palette');
    const sysInfo = wx.getSystemInfoSync();
    this.setData({
      screenWidth: sysInfo.windowWidth,
      screenHeight: sysInfo.windowHeight
    });
    this.checkFirstTimeUser();

    if (this.data.graphObjects.length > 0) {
      this.redrawCanvas();
    }
  },

  // ---------- 文件加载 ----------

  consumePendingFileId(isLoad) {
    const app = getApp();
    if (!app || !app.globalData) return;
    const pending = app.globalData.pendingFileId;
    if (!pending) return;

    if (pending === '__reset__') {
      app.globalData.pendingFileId = '';
      this.applyEmptyBoard();
      return;
    }

    if (pending === '__new__') {
      app.globalData.pendingFileId = '';
      this.createNewBoard();
      return;
    }

    if (pending === '__detach__') {
      // 当前编辑的文件被删除：保留画板内容，仅解除文件绑定，等待用户再次保存生成新 ID
      app.globalData.pendingFileId = '';
      this.setData({
        currentFileId: '',
        fileName: '',
        hasChanges: this.data.graphObjects.length > 0
      });
      return;
    }

    if (pending === this.data.currentFileId) {
      app.globalData.pendingFileId = '';
      return;
    }

    app.globalData.pendingFileId = '';

    if (!isLoad && this.data.hasChanges) {
      this.confirmDiscardAndLoad(pending);
    } else {
      this.loadBoardFile(pending);
    }
  },

  confirmDiscardAndLoad(pendingId) {
    wx.showModal({
      title: '内容尚未保存',
      content: '离开当前画板将丢失未保存的修改，是否继续？',
      confirmText: '不保存',
      cancelText: '取消',
      success: res => {
        if (res.confirm) {
          this.loadBoardFile(pendingId);
        }
      }
    });
  },

  loadBoardFile(fileId) {
    const file = boardStore.getFile(fileId);
    if (!file) {
      wx.showToast({ title: '画板文件不存在', icon: 'none' });
      return;
    }
    const data = file.data || {};
    this.setData({
      currentFileId: file.id,
      fileName: file.name || '',
      hasChanges: false,
      graphObjects: data.graphObjects || [],
      canvasBounds: data.canvasBounds || { minX: 0, maxX: 800, minY: 0, maxY: 1000 },
      canvasWidth: data.canvasWidth || 800,
      canvasHeight: data.canvasHeight || 1000,
      scale: data.scale || 1,
      translateX: data.translateX || 0,
      translateY: data.translateY || 0,
      brushState: data.brushState || 'p',
      tinctCurr: typeof data.tinctCurr === 'number' ? data.tinctCurr : 0,
      tinctSize: data.tinctSize || 3,
      customColor: data.customColor || '',
      currentMode: data.currentMode || 'draw',
      activeObjectId: null
    }, () => {
      const app = getApp();
      if (app && app.globalData) app.globalData.currentEditingFileId = file.id;
      if (this.context) this.redrawCanvas();
    });
  },

  applyEmptyBoard() {
    if (this.context) {
      this.context.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
      this.context.draw();
    }
    this.setData({
      currentFileId: '',
      fileName: '',
      hasChanges: false,
      graphObjects: [],
      canvasBounds: { minX: 0, maxX: 800, minY: 0, maxY: 1000 },
      canvasWidth: 800,
      canvasHeight: 1000,
      scale: 1,
      translateX: 0,
      translateY: 0,
      activeObjectId: null,
      customColor: '',
      tinctCurr: 0
    });
    const app = getApp();
    if (app && app.globalData) app.globalData.currentEditingFileId = '';
  },

  markChanged() {
    if (!this.data.hasChanges) {
      this.setData({ hasChanges: true });
    }
  },

  // ---------- 新建画板 ----------

  createNewBoard() {
    const hasContent = (this.data.graphObjects && this.data.graphObjects.length > 0) || !!this.data.currentFileId;
    if (!hasContent) {
      this.applyEmptyBoard();
      return;
    }
    if (!this.data.hasChanges) {
      this.applyEmptyBoard();
      return;
    }
    wx.showModal({
      title: '新建画板？',
      content: '当前画板尚有未保存的修改，新建后将丢失这些修改。',
      confirmText: '新建',
      cancelText: '取消',
      confirmColor: '#2563EB',
      success: res => {
        if (res.confirm) this.applyEmptyBoard();
      }
    });
  },

  // ---------- 当前颜色 ----------

  getCurrentColor() {
    const idx = this.data.tinctCurr;
    if (idx === -1 && this.data.customColor) return this.data.customColor;
    const colors = this.data.tinctList || [];
    return colors[idx] || colors[0] || '#000000';
  },

  // ---------- 任意颜色弹层 ----------

  setTabBarHidden(hidden) {
    if (typeof this.getTabBar === 'function') {
      const tb = this.getTabBar();
      if (tb && tb.setData) tb.setData({ hidden: !!hidden });
    }
  },

  openColorPicker() {
    const current = this.getCurrentColor();
    const hsl = hexToHsl(current);
    let hue = hsl.h;
    let light = hsl.l;
    if (light < 20 || light > 80) light = 50;
    const previewHex = hslToHex(hue, 80, light);
    this.setTabBarHidden(true);
    this.setData({
      showColorPicker: true,
      pickerHue: hue,
      pickerLight: light,
      pickerColor: previewHex
    });
  },

  closeColorPicker() {
    this.setTabBarHidden(false);
    this.setData({ showColorPicker: false });
  },

  onHueChange(e) {
    const hue = Number(e.detail.value);
    const hex = hslToHex(hue, 80, this.data.pickerLight);
    this.setData({ pickerHue: hue, pickerColor: hex });
  },

  onLightChange(e) {
    const light = Number(e.detail.value);
    const hex = hslToHex(this.data.pickerHue, 80, light);
    this.setData({ pickerLight: light, pickerColor: hex });
  },

  onPresetPick(e) {
    const color = e.currentTarget.dataset.color;
    if (!color) return;
    const hsl = hexToHsl(color);
    this.setData({
      pickerColor: color,
      pickerHue: hsl.h,
      pickerLight: hsl.l < 10 ? 10 : (hsl.l > 90 ? 90 : hsl.l)
    });
  },

  confirmCustomColor() {
    const color = this.data.pickerColor || '#000000';
    const tinctList = this.data.tinctList || [];
    const presetIndex = tinctList.indexOf(color);
    this.setTabBarHidden(false);
    this.setData({
      customColor: presetIndex >= 0 ? '' : color,
      tinctCurr: presetIndex >= 0 ? presetIndex : -1,
      brushState: 'p',
      currentMode: 'draw',
      showColorPicker: false
    });
  },

  // ---------- 首次使用 ----------

  checkFirstTimeUser() {
    try {
      if (!wx.getStorageSync('hasUsedNotePaint')) {
        setTimeout(() => this.setData({ showTutorial: true }), 500);
      }
    } catch (e) {
      console.error('检查首次使用状态失败:', e);
    }
  },

  closeTutorial() {
    this.setData({ showTutorial: false });
    try {
      wx.setStorageSync('hasUsedNotePaint', true);
    } catch (e) {
      console.error('保存使用状态失败:', e);
    }
  },

  stopPropagation() {},

  // ---------- 坐标 / 边界 ----------

  screenToCanvas(screenX, screenY) {
    return {
      x: (screenX - this.data.translateX) / this.data.scale,
      y: (screenY - this.data.translateY) / this.data.scale
    };
  },

  getDistance(t1, t2) {
    const dx = t1.x - t2.x;
    const dy = t1.y - t2.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  expandCanvasBounds(x, y) {
    const bounds = this.data.canvasBounds;
    let needUpdate = false;
    const padding = 50;
    if (x < bounds.minX) { bounds.minX = Math.floor(x - padding); needUpdate = true; }
    if (x > bounds.maxX) { bounds.maxX = Math.ceil(x + padding); needUpdate = true; }
    if (y < bounds.minY) { bounds.minY = Math.floor(y - padding); needUpdate = true; }
    if (y > bounds.maxY) { bounds.maxY = Math.ceil(y + padding); needUpdate = true; }
    if (needUpdate) {
      this.setData({
        canvasBounds: bounds,
        canvasWidth: bounds.maxX - bounds.minX,
        canvasHeight: bounds.maxY - bounds.minY
      });
    }
  },

  // ---------- 触摸事件 ----------

  touchstart(e) {
    const touches = e.touches;
    if (touches.length === 1) {
      const touch = touches[0];
      if (this.data.currentMode === 'select') {
        const canvasPos = this.screenToCanvas(touch.x, touch.y);
        let found = false;
        const objects = this.data.graphObjects;
        for (let i = objects.length - 1; i >= 0; i--) {
          const obj = objects[i];
          const box = obj.itemBox;
          if (canvasPos.x >= box.minX + (obj.x || 0) && canvasPos.x <= box.maxX + (obj.x || 0) &&
              canvasPos.y >= box.minY + (obj.y || 0) && canvasPos.y <= box.maxY + (obj.y || 0)) {
            this.setData({
              activeObjectId: obj.id,
              isDraggingObject: true,
              lastDragPoint: { x: touch.x, y: touch.y }
            });
            found = true;
            break;
          }
        }
        if (!found) {
          this.setData({
            activeObjectId: null,
            isDraggingObject: false,
            isPanning: true,
            lastPanPoint: { x: touch.x, y: touch.y }
          });
        }
        this.redrawCanvas();
        return;
      }

      let tinct, lineWidth;
      const brushState = this.data.brushState || 'p';
      if (brushState === 'p') {
        tinct = this.getCurrentColor();
        lineWidth = this.data.tinctSize || 3;
      } else {
        tinct = '#ffffff';
        lineWidth = 20;
      }

      this.context.setStrokeStyle(tinct);
      this.context.setLineWidth(lineWidth);
      this.context.setLineCap('round');
      this.context.setLineJoin('round');

      const canvasPos = this.screenToCanvas(touch.x, touch.y);
      this.expandCanvasBounds(canvasPos.x, canvasPos.y);
      this.setData({ isDrawing: true });

      const newPath = {
        id: 'path_' + Date.now(),
        type: 'path',
        x: 0, y: 0,
        points: [canvasPos],
        style: { color: tinct, width: lineWidth },
        itemBox: {
          minX: canvasPos.x, maxX: canvasPos.x,
          minY: canvasPos.y, maxY: canvasPos.y
        }
      };
      this.data.graphObjects.push(newPath);
    } else if (touches.length === 2) {
      const centerX = (touches[0].x + touches[1].x) / 2;
      const centerY = (touches[0].y + touches[1].y) / 2;
      this.setData({
        isDrawing: false,
        isZooming: true,
        lastTouchDistance: this.getDistance(touches[0], touches[1]),
        lastPanPoint: { x: centerX, y: centerY }
      });
    }
  },

  touchMove(e) {
    const touches = e.touches;
    if (this.data.currentMode === 'select' && this.data.isDraggingObject && touches.length === 1 && this.data.activeObjectId) {
      const touch = touches[0];
      const dxs = touch.x - this.data.lastDragPoint.x;
      const dys = touch.y - this.data.lastDragPoint.y;
      const dxc = dxs / this.data.scale;
      const dyc = dys / this.data.scale;
      const obj = this.data.graphObjects.find(o => o.id === this.data.activeObjectId);
      if (obj) {
        obj.x = (obj.x || 0) + dxc;
        obj.y = (obj.y || 0) + dyc;
        this.setData({ lastDragPoint: { x: touch.x, y: touch.y } });
        this.redrawCanvas();
      }
      return;
    }

    if (this.data.isDrawing && touches.length === 1) {
      const touch = touches[0];
      const canvasPos = this.screenToCanvas(touch.x, touch.y);
      this.expandCanvasBounds(canvasPos.x, canvasPos.y);
      const objects = this.data.graphObjects;
      const cur = objects[objects.length - 1];
      if (cur && cur.type === 'path') {
        const last = cur.points[cur.points.length - 1];
        const dx = canvasPos.x - last.x;
        const dy = canvasPos.y - last.y;
        if (dx * dx + dy * dy < 4) return;
        cur.points.push(canvasPos);
        cur.itemBox.minX = Math.min(cur.itemBox.minX, canvasPos.x);
        cur.itemBox.maxX = Math.max(cur.itemBox.maxX, canvasPos.x);
        cur.itemBox.minY = Math.min(cur.itemBox.minY, canvasPos.y);
        cur.itemBox.maxY = Math.max(cur.itemBox.maxY, canvasPos.y);
        this.bindDraw(cur.points);
      }
    } else if (this.data.isZooming && touches.length === 2) {
      const currentDistance = this.getDistance(touches[0], touches[1]);
      const scaleChange = currentDistance / this.data.lastTouchDistance;
      let newScale = Math.max(0.05, this.data.scale * scaleChange);
      const centerX = (touches[0].x + touches[1].x) / 2;
      const centerY = (touches[0].y + touches[1].y) / 2;
      const moveX = centerX - this.data.lastPanPoint.x;
      const moveY = centerY - this.data.lastPanPoint.y;
      let newTx = centerX - (centerX - this.data.translateX) * (newScale / this.data.scale);
      let newTy = centerY - (centerY - this.data.translateY) * (newScale / this.data.scale);
      newTx += moveX;
      newTy += moveY;
      this.data.scale = newScale;
      this.data.translateX = newTx;
      this.data.translateY = newTy;
      this.data.lastTouchDistance = currentDistance;
      this.data.lastPanPoint = { x: centerX, y: centerY };
      const newPercent = Math.round(newScale * 100);
      if (newPercent !== this.data.scalePercent) {
        this.setData({ scalePercent: newPercent, showScaleToast: true });
      }
      const now = Date.now();
      if (now - (this.lastRenderTime || 0) > 20) {
        this.redrawCanvas();
        this.lastRenderTime = now;
      }
    } else if (this.data.isPanning && touches.length === 1) {
      const touch = touches[0];
      if (this.data.lastPanPoint) {
        const dX = touch.x - this.data.lastPanPoint.x;
        const dY = touch.y - this.data.lastPanPoint.y;
        this.setData({
          translateX: this.data.translateX + dX,
          translateY: this.data.translateY + dY,
          lastPanPoint: { x: touch.x, y: touch.y }
        });
        this.redrawCanvas();
      }
    }
  },

  touchEnd() {
    const changed = this.data.isDrawing || this.data.isDraggingObject;
    this.setData({
      isDrawing: false,
      isPanning: false,
      isZooming: false,
      isDraggingObject: false,
      lastPanPoint: null,
      lastTouchDistance: 0,
      showScaleToast: false
    });
    if (changed) this.markChanged();
  },

  // ---------- 绘制 ----------

  bindDraw(points) {
    if (!points || points.length < 1) return;
    this.context.save();
    this.context.scale(this.data.scale, this.data.scale);
    this.context.translate(this.data.translateX / this.data.scale, this.data.translateY / this.data.scale);
    this.context.beginPath();
    this.context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.context.lineTo(points[i].x, points[i].y);
    }
    this.context.stroke();
    this.context.restore();
    this.context.draw(true);
  },

  renderToContext(ctx, width, height, scale, tx, ty, isExport) {
    ctx.clearRect(0, 0, width, height);
    if (isExport) {
      ctx.setFillStyle('#ffffff');
      ctx.fillRect(0, 0, width, height);
    }
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(tx / scale, ty / scale);
    const objects = this.data.graphObjects;
    if (!isExport) {
      const buffer = 100;
      const vX = -tx / scale - buffer;
      const vY = -ty / scale - buffer;
      const vW = (width / scale) + buffer * 2;
      const vH = (height / scale) + buffer * 2;
      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const box = obj.itemBox;
        const objMinX = box.minX + (obj.x || 0);
        const objMaxX = box.maxX + (obj.x || 0);
        const objMinY = box.minY + (obj.y || 0);
        const objMaxY = box.maxY + (obj.y || 0);
        if (objMinX > vX + vW || objMaxX < vX || objMinY > vY + vH || objMaxY < vY) continue;
        this.drawObject(ctx, obj, false);
      }
    } else {
      for (let i = 0; i < objects.length; i++) {
        this.drawObject(ctx, objects[i], true);
      }
    }
    ctx.restore();
  },

  redrawCanvas() {
    this.renderToContext(
      this.context,
      this.data.canvasWidth,
      this.data.canvasHeight,
      this.data.scale,
      this.data.translateX,
      this.data.translateY,
      false
    );
    this.context.draw();
  },

  drawObject(ctx, obj, hideSelection) {
    if (obj.type === 'path') {
      if (obj.points.length > 0) {
        ctx.setStrokeStyle(obj.style.color);
        ctx.setLineWidth(obj.style.width);
        ctx.setLineCap('round');
        ctx.setLineJoin('round');
        ctx.beginPath();
        ctx.moveTo(obj.points[0].x + (obj.x || 0), obj.points[0].y + (obj.y || 0));
        for (let j = 1; j < obj.points.length; j++) {
          ctx.lineTo(obj.points[j].x + (obj.x || 0), obj.points[j].y + (obj.y || 0));
        }
        ctx.stroke();
      }
    } else if (obj.type === 'image') {
      ctx.drawImage(obj.src, obj.x, obj.y, obj.w, obj.h);
    }

    if (!hideSelection && this.data.activeObjectId === obj.id) {
      ctx.setStrokeStyle('#2563EB');
      ctx.setLineWidth(2);
      const box = obj.itemBox;
      const finalX = box.minX + (obj.x || 0);
      const finalY = box.minY + (obj.y || 0);
      const finalW = box.maxX - box.minX;
      const finalH = box.maxY - box.minY;
      ctx.strokeRect(finalX - 5, finalY - 5, finalW + 10, finalH + 10);
    }
  },

  // ---------- 工具栏 ----------

  switchMode(e) {
    this.setData({
      currentMode: e.currentTarget.dataset.mode,
      activeObjectId: null
    });
    this.redrawCanvas();
  },

  switchBrush(e) {
    this.setData({
      currentMode: 'draw',
      brushState: e.currentTarget.dataset.state
    });
  },

  tinColorChange(e) {
    this.setData({
      tinctCurr: Number(e.currentTarget.dataset.index),
      customColor: '',
      brushState: 'p',
      currentMode: 'draw'
    });
  },

  tinSizechange(e) {
    this.setData({ tinctSize: e.detail.value });
  },

  adjustSize(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    let next = (this.data.tinctSize || 3) + delta;
    if (next < 1) next = 1;
    if (next > 10) next = 10;
    this.setData({ tinctSize: next });
  },

  drawBack() {
    if (this.data.graphObjects.length === 0) return;
    this.data.graphObjects.pop();
    this.setData({ activeObjectId: null });
    this.redrawCanvas();
    this.markChanged();
  },

  drawClear() {
    if (this.data.graphObjects.length === 0) return;
    wx.showModal({
      title: '清空画布？',
      content: '清空后当前画布内容将被移除，是否继续？',
      confirmText: '清空',
      confirmColor: '#EF4444',
      success: res => {
        if (res.confirm) this.doClearCanvas();
      }
    });
  },

  doClearCanvas() {
    this.context.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
    this.context.draw();
    this.setData({
      graphObjects: [],
      activeObjectId: null,
      canvasBounds: { minX: 0, maxX: 800, minY: 0, maxY: 1000 },
      canvasWidth: 800,
      canvasHeight: 1000,
      scale: 1,
      translateX: 0,
      translateY: 0
    });
    this.markChanged();
  },

  chooseImage() {
    const that = this;
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFilePath = res.tempFilePaths[0];
        wx.getImageInfo({
          src: tempFilePath,
          success: info => {
            that.persistTempFile(tempFilePath, savedPath => {
              const ratio = info.width / info.height;
              const w = 200;
              const h = 200 / (ratio || 1);
              const cx = that.data.screenWidth / 2;
              const cy = that.data.screenHeight / 2;
              const canvasPos = that.screenToCanvas(cx, cy);
              const newImg = {
                id: 'img_' + Date.now(),
                type: 'image',
                src: savedPath || tempFilePath,
                x: canvasPos.x - w / 2,
                y: canvasPos.y - h / 2,
                w: w,
                h: h,
                itemBox: { minX: 0, maxX: w, minY: 0, maxY: h }
              };
              that.data.graphObjects.push(newImg);
              that.expandCanvasBounds(newImg.x, newImg.y);
              that.expandCanvasBounds(newImg.x + w, newImg.y + h);
              that.redrawCanvas();
              that.markChanged();
            });
          }
        });
      }
    });
  },

  persistTempFile(tempFilePath, callback) {
    if (!tempFilePath || !wx.saveFile) {
      callback(tempFilePath || '');
      return;
    }
    wx.saveFile({
      tempFilePath,
      success: res => callback(res.savedFilePath || tempFilePath),
      fail: () => callback(tempFilePath)
    });
  },

  // ---------- 导出到相册 ----------

  exportImage() {
    if (this.data.isExportingImage) return;
    if (!this.data.graphObjects || this.data.graphObjects.length === 0) {
      wx.showToast({ title: '画板为空', icon: 'none' });
      return;
    }

    const bounds = this.data.canvasBounds;
    const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const padding = 40;
    const maxLong = 1400;
    const longSide = Math.max(contentWidth, contentHeight);
    const renderScale = longSide > maxLong - padding * 2 ? (maxLong - padding * 2) / longSide : 1;
    const exportWidth = Math.round(contentWidth * renderScale + padding * 2);
    const exportHeight = Math.round(contentHeight * renderScale + padding * 2);
    const tx = padding - bounds.minX * renderScale;
    const ty = padding - bounds.minY * renderScale;

    this.setData({
      isExportingImage: true,
      exportWidth,
      exportHeight
    }, () => {
      wx.showLoading({ title: '导出中...', mask: true });
      const exportCtx = wx.createCanvasContext('exportCanvas', this);
      this.renderToContext(exportCtx, exportWidth, exportHeight, renderScale, tx, ty, true);
      exportCtx.draw(true, () => {
        wx.canvasToTempFilePath({
          canvasId: 'exportCanvas',
          fileType: 'png',
          quality: 1,
          width: exportWidth,
          height: exportHeight,
          destWidth: exportWidth,
          destHeight: exportHeight,
          success: res => this.saveToAlbum(res.tempFilePath),
          fail: () => {
            wx.hideLoading();
            this.setData({ isExportingImage: false });
            wx.showToast({ title: '导出失败', icon: 'none' });
          }
        }, this);
      });
    });
  },

  saveToAlbum(tempFilePath) {
    const finish = (ok, msg) => {
      wx.hideLoading();
      this.setData({ isExportingImage: false });
      wx.showToast({ title: msg, icon: ok ? 'success' : 'none' });
    };

    const doSave = () => {
      wx.saveImageToPhotosAlbum({
        filePath: tempFilePath,
        success: () => finish(true, '已保存到相册'),
        fail: err => {
          if (err && /cancel/i.test(err.errMsg || '')) {
            finish(false, '已取消');
          } else {
            finish(false, '保存失败');
          }
        }
      });
    };

    wx.getSetting({
      success: settingRes => {
        if (settingRes.authSetting['scope.writePhotosAlbum'] === false) {
          wx.hideLoading();
          wx.showModal({
            title: '需要相册权限',
            content: '保存到相册需要授权访问相册，是否前往开启？',
            confirmText: '去开启',
            success: modalRes => {
              if (modalRes.confirm) {
                wx.openSetting({
                  success: settingRes2 => {
                    if (settingRes2.authSetting['scope.writePhotosAlbum']) {
                      wx.showLoading({ title: '导出中...', mask: true });
                      doSave();
                    } else {
                      this.setData({ isExportingImage: false });
                    }
                  },
                  fail: () => this.setData({ isExportingImage: false })
                });
              } else {
                this.setData({ isExportingImage: false });
              }
            }
          });
        } else {
          doSave();
        }
      },
      fail: () => doSave()
    });
  },

  // ---------- 保存 ----------

  saveBoard() {
    if (this.data.isSavingBoard) return;
    if (this.data.graphObjects.length === 0 && !this.data.currentFileId) {
      wx.showToast({ title: '画板为空，无需保存', icon: 'none' });
      return;
    }
    if (!boardStore.canCreateFile(this.data.currentFileId)) {
      wx.showToast({ title: '开通会员后可保存更多文件', icon: 'none' });
      return;
    }

    this.setData({ isSavingBoard: true });
    wx.showLoading({ title: '正在保存...', mask: true });

    this.generateThumbnail(thumbnail => {
      const result = boardStore.saveFile({
        id: this.data.currentFileId,
        name: this.data.fileName,
        thumbnail,
        data: this.buildBoardData()
      });
      wx.hideLoading();
      this.setData({ isSavingBoard: false });
      if (!result.ok) {
        wx.showToast({ title: result.message || '保存失败，请稍后重试', icon: 'none' });
        return;
      }
      const app = getApp();
      if (app && app.globalData) app.globalData.currentEditingFileId = result.file.id;
      this.setData({
        currentFileId: result.file.id,
        fileName: result.file.name,
        hasChanges: false
      });
      wx.showToast({ title: '保存成功', icon: 'success' });
    });
  },

  buildBoardData() {
    return {
      graphObjects: this.data.graphObjects,
      canvasBounds: this.data.canvasBounds,
      canvasWidth: this.data.canvasWidth,
      canvasHeight: this.data.canvasHeight,
      scale: this.data.scale,
      translateX: this.data.translateX,
      translateY: this.data.translateY,
      brushState: this.data.brushState,
      tinctCurr: this.data.tinctCurr,
      tinctSize: this.data.tinctSize,
      customColor: this.data.customColor || '',
      currentMode: this.data.currentMode
    };
  },

  generateThumbnail(callback) {
    const bounds = this.data.canvasBounds;
    const contentWidth = Math.max(bounds.maxX - bounds.minX, 1);
    const contentHeight = Math.max(bounds.maxY - bounds.minY, 1);
    const thumbSize = 240;
    const padding = 16;
    const scale = Math.min(
      (thumbSize - padding * 2) / contentWidth,
      (thumbSize - padding * 2) / contentHeight
    );
    const tx = padding - bounds.minX * scale + (thumbSize - padding * 2 - contentWidth * scale) / 2;
    const ty = padding - bounds.minY * scale + (thumbSize - padding * 2 - contentHeight * scale) / 2;

    this.setData({ exportWidth: thumbSize, exportHeight: thumbSize }, () => {
      const exportCtx = wx.createCanvasContext('exportCanvas', this);
      this.renderToContext(exportCtx, thumbSize, thumbSize, scale, tx, ty, true);
      exportCtx.draw(true, () => {
        wx.canvasToTempFilePath({
          canvasId: 'exportCanvas',
          fileType: 'jpg',
          quality: 0.7,
          width: thumbSize,
          height: thumbSize,
          destWidth: thumbSize,
          destHeight: thumbSize,
          success: res => this.persistTempFile(res.tempFilePath, callback),
          fail: () => callback('')
        }, this);
      });
    });
  }
});
