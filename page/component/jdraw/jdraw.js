const boardStore = require('../../../utils/boardStore');
const fileUnlockStore = require('../../../utils/fileUnlockStore');
const rewardedVideoAd = require('../../../utils/rewardedVideoAd');
const share = require('../../../utils/share');
const geometry = require('../../../utils/strokeGeometry');
const editHistory = require('../../../utils/editHistory');
const draftStore = require('../../../utils/draftStore');
const boardData = require('../../../utils/boardData');
const TUTORIAL_STORAGE_KEY = 'hasUsedNotePaint';
const TUTORIAL_DOT_STORAGE_KEY = 'hasReadNotePaintTutorialDot';

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

function hexToRgb(hex) {
  if (!hex || hex.charAt(0) !== '#') return { r: 0, g: 0, b: 0 };
  let v = hex.slice(1);
  if (v.length === 3) v = v.split('').map(c => c + c).join('');
  if (v.length !== 6) return { r: 0, g: 0, b: 0 };
  return {
    r: parseInt(v.slice(0, 2), 16) || 0,
    g: parseInt(v.slice(2, 4), 16) || 0,
    b: parseInt(v.slice(4, 6), 16) || 0
  };
}

function rgbToHex(r, g, b) {
  return '#' + toHex(r) + toHex(g) + toHex(b);
}

function clamp01(value) {
  return Math.max(0, Math.min(1, value));
}

function setStrokeStyleCompat(ctx, value) {
  if (!ctx) return;
  if (typeof ctx.setStrokeStyle === 'function') ctx.setStrokeStyle(value);
  else ctx.strokeStyle = value;
}

function setFillStyleCompat(ctx, value) {
  if (!ctx) return;
  if (typeof ctx.setFillStyle === 'function') ctx.setFillStyle(value);
  else ctx.fillStyle = value;
}

function setLineWidthCompat(ctx, value) {
  if (!ctx) return;
  if (typeof ctx.setLineWidth === 'function') ctx.setLineWidth(value);
  else ctx.lineWidth = value;
}

function setLineCapCompat(ctx, value) {
  if (!ctx) return;
  if (typeof ctx.setLineCap === 'function') ctx.setLineCap(value);
  else ctx.lineCap = value;
}

function setLineJoinCompat(ctx, value) {
  if (!ctx) return;
  if (typeof ctx.setLineJoin === 'function') ctx.setLineJoin(value);
  else ctx.lineJoin = value;
}

function flushCanvasCompat(ctx, preserve, callback) {
  if (ctx && typeof ctx.draw === 'function') {
    ctx.draw(!!preserve, callback);
    return;
  }
  if (typeof callback === 'function') callback();
}

function isCanvas2dContext(ctx) {
  return !!(ctx && typeof ctx.draw !== 'function');
}

function getTouchPosition(touch) {
  const value = touch || {};
  const x = [value.x, value.clientX, value.pageX].find(item => Number.isFinite(item));
  const y = [value.y, value.clientY, value.pageY].find(item => Number.isFinite(item));
  return { x: Number.isFinite(x) ? x : 0, y: Number.isFinite(y) ? y : 0 };
}

function getTouchIdentifier(touch) {
  return touch && touch.identifier !== undefined ? touch.identifier : null;
}

/** 取值 0～max → thumb-lane（两端圆帽圆心之间）上 0%～100%，与 WXSS inset 同步 */
function sliderThumbLinePct(value, maxVal) {
  if (!maxVal) return 0;
  const t = Math.max(0, Math.min(1, value / maxVal));
  return Math.round(t * 1000) / 10;
}

function parseColor(value) {
  if (!value) return { r: 0, g: 0, b: 0, a: 100 };
  if (value.charAt(0) === '#') {
    const rgb = hexToRgb(value);
    return { r: rgb.r, g: rgb.g, b: rgb.b, a: 100 };
  }
  const match = /^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([.\d]+))?\)$/i.exec(value);
  if (!match) return { r: 0, g: 0, b: 0, a: 100 };
  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] ? Math.round(Number(match[4]) * 100) : 100
  };
}

function hsvToRgb(h, s, v) {
  const c = v * s;
  const x = c * (1 - Math.abs((h / 60) % 2 - 1));
  const m = v - c;
  let r1 = 0;
  let g1 = 0;
  let b1 = 0;
  if (h < 60) {
    r1 = c; g1 = x;
  } else if (h < 120) {
    r1 = x; g1 = c;
  } else if (h < 180) {
    g1 = c; b1 = x;
  } else if (h < 240) {
    g1 = x; b1 = c;
  } else if (h < 300) {
    r1 = x; b1 = c;
  } else {
    r1 = c; b1 = x;
  }
  return {
    r: Math.round((r1 + m) * 255),
    g: Math.round((g1 + m) * 255),
    b: Math.round((b1 + m) * 255)
  };
}

function rgbToHsv(r, g, b) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    if (max === g) h = 60 * ((b - r) / d + 2);
    if (max === b) h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return {
    h: Math.round(h),
    s: max === 0 ? 0 : d / max,
    v: max
  };
}

function buildColorGrid() {
  const rows = [];
  const columns = 12;
  const grayRow = [];
  for (let c = 0; c < columns; c++) {
    const v = Math.round(255 - (255 * c / (columns - 1)));
    const color = rgbToHex(v, v, v);
    const x = grayValueToSpectrumX(v / 255);
    grayRow.push({ color, hex: color.slice(1).toUpperCase(), spectrumX: sliderThumbLinePct(x, 1), spectrumY: 0 });
  }
  rows.push({ id: 'gray', cells: grayRow });
  for (let r = 0; r < 8; r++) {
    const row = [];
    const value = 0.35 + (r / 7) * 0.65;
    for (let c = 0; c < columns; c++) {
      const hue = (c / columns) * 360;
      const rgb = hsvToRgb(hue, 1, value);
      const color = rgbToHex(rgb.r, rgb.g, rgb.b);
      const x = valueToSpectrumX(value);
      const y = hueToSpectrumY(hue);
      row.push({ color, hex: color.slice(1).toUpperCase(), spectrumX: sliderThumbLinePct(x, 1), spectrumY: sliderThumbLinePct(y, 1) });
    }
    rows.push({ id: 'hue-' + r, cells: row });
  }
  return rows;
}

const SPECTRUM_GRAY_EDGE_RATIO = 1 / 90;
const SPECTRUM_PURE_X = 0.56;

function grayValueToSpectrumX(value) {
  return 1 - clamp01(value);
}

function valueToSpectrumX(value) {
  const v = clamp01(value);
  return SPECTRUM_PURE_X + (1 - v) * (1 - SPECTRUM_PURE_X);
}

function spectrumXToValue(x) {
  const nx = clamp01(x);
  if (nx <= SPECTRUM_PURE_X) return 1;
  return 1 - ((nx - SPECTRUM_PURE_X) / (1 - SPECTRUM_PURE_X));
}

function hueToSpectrumY(hue) {
  const h = ((hue % 360) + 360) % 360;
  const colorY = h === 0 ? 1 : h / 360;
  return SPECTRUM_GRAY_EDGE_RATIO + colorY * (1 - SPECTRUM_GRAY_EDGE_RATIO);
}

function spectrumRgbFromPoint(x, y) {
  const nx = clamp01(x);
  const ny = clamp01(y);
  if (ny <= SPECTRUM_GRAY_EDGE_RATIO) {
    const v = Math.round(255 * (1 - nx));
    return { r: v, g: v, b: v };
  }

  const colorY = clamp01((ny - SPECTRUM_GRAY_EDGE_RATIO) / (1 - SPECTRUM_GRAY_EDGE_RATIO));
  const hue = colorY * 360;
  const saturation = nx <= SPECTRUM_PURE_X ? nx / SPECTRUM_PURE_X : 1;
  const value = spectrumXToValue(nx);
  return hsvToRgb(hue, saturation, value);
}

function spectrumPointFromRgb(rgb) {
  const hsv = rgbToHsv(rgb.r, rgb.g, rgb.b);
  if (rgb.r === rgb.g && rgb.g === rgb.b) {
    const x = grayValueToSpectrumX(rgb.r / 255);
    return {
      x: sliderThumbLinePct(x, 1),
      y: 0
    };
  }

  const baseX = valueToSpectrumX(hsv.v);
  const x = hsv.s < 0.999 && hsv.v > 0.99 ? hsv.s * SPECTRUM_PURE_X : baseX;
  const y = hueToSpectrumY(hsv.h);

  return {
    x: sliderThumbLinePct(x, 1),
    y: sliderThumbLinePct(y, 1)
  };
}

const PICKER_GRID_ROWS = buildColorGrid();

Page({
  data: {
    graphObjects: [],
    currentMode: 'draw',
    activeObjectId: null,
    canUndo: false,
    canRedo: false,
    draftStatus: '',
    isErasing: false,
    eraserSize: 20,

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
    currentPenIconColor: '#000000',

    showColorPicker: false,
    pickerTab: 'grid',
    pickerColor: '#000000',
    pickerHex: '000000',
    pickerRed: 0,
    pickerGreen: 0,
    pickerBlue: 0,
    pickerAlpha: 100,
    pickerSpectrumX: 0,
    pickerSpectrumY: 100,
    pickerRedThumbPct: 0,
    pickerGreenThumbPct: 0,
    pickerBlueThumbPct: 0,
    pickerAlphaThumbPct: 100,
    pickerGrid: PICKER_GRID_ROWS,

    canvasWidth: 800,
    canvasHeight: 1000,
    viewportWidth: 1,
    viewportHeight: 1,
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
    showTutorialDot: true,
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
    this.boardEpoch = 1;
    this.changeRevision = 0;
    this.resetHistory();
    share.enableShareMenu();
    this.saveFileAd = rewardedVideoAd.createRewardedVideoAd(rewardedVideoAd.SAVE_FILE_AD_UNIT_ID, {
      cancelMessage: '完整观看广告后才能保存更多文件',
      errorMessage: '广告暂不可用，请稍后再试'
    });
    this.exportImageAd = rewardedVideoAd.createRewardedVideoAd(rewardedVideoAd.EXPORT_IMAGE_AD_UNIT_ID, {
      cancelMessage: '完整观看广告后才能导出',
      errorMessage: '广告暂不可用，请稍后再试'
    });
    this.initTutorialDot();
    this.restoreDraft();
    this.consumePendingFileId(true);
  },

  onShow() {
    this.pageHidden = false;
    // A system back gesture may hide the page without delivering a final
    // touchend. Do not let its ignore flag swallow the first touch on return.
    this.touchSession = null;
    this.edgeBackActive = false;
    this.touchSessionCancelled = false;
    this.ignoreSingleTouch = false;
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({
        selected: 0,
        hidden: !!this.data.showColorPicker
      });
    }
    this.consumePendingFileId(false);
    if (this.context) this.requestCanvasDraw();
  },

  onShareAppMessage() {
    return share.getShareInfo();
  },

  onShareTimeline() {
    return share.getTimelineInfo();
  },

  onHide() {
    this.pageHidden = true;
    if (this.hasActiveTouch()) {
      if (this.edgeBackActive || this.touchSessionCancelled) this.cancelGestureEdit();
      else {
        this.finishGestureEdit();
        this.resetTouchState(false);
      }
    }
    this.flushDraft();
    this.cancelCanvasDraw();
    if (this.scaleToastTimer) clearTimeout(this.scaleToastTimer);
    if (this.tutorialTimer) clearTimeout(this.tutorialTimer);
  },

  onUnload() {
    this.onHide();
    this.unloaded = true;
    if (this.saveFileAd && this.saveFileAd.destroy) this.saveFileAd.destroy();
    if (this.exportImageAd && this.exportImageAd.destroy) this.exportImageAd.destroy();
  },

  onReady() {
    const sysInfo = wx.getSystemInfoSync();
    this.pixelRatio = sysInfo.pixelRatio || 1;
    const screenWidth = sysInfo.windowWidth;
    const screenHeight = sysInfo.windowHeight;
    const shouldCenterDefaultBoard = !this.data.currentFileId &&
      (!this.data.graphObjects || this.data.graphObjects.length === 0) &&
      (this.data.translateX || 0) === 0 &&
      (this.data.translateY || 0) === 0;
    const viewState = shouldCenterDefaultBoard
      ? this.getCenteredCanvasViewState(this.data.canvasWidth, this.data.canvasHeight, this.data.scale, screenWidth, screenHeight)
      : {};
    this.setData(Object.assign({
      screenWidth: sysInfo.windowWidth,
      screenHeight: sysInfo.windowHeight,
      viewportWidth: screenWidth,
      viewportHeight: screenHeight
    }, viewState), () => {
      this.initMainCanvas();
      this.checkFirstTimeUser();
    });
  },

  initMainCanvas() {
    wx.createSelectorQuery()
      .in(this)
      .select('#palette')
      .fields({ node: true, size: true }, res => {
        if (this.unloaded || !res || !res.node) return;
        this.mainCanvas = res.node;
        this.imageNodeCache = {};
        this.context = res.node.getContext('2d');
        this.syncMainCanvasSize();
        if (this.data.graphObjects.length > 0) {
          this.redrawCanvas();
        } else {
          this.clearMainCanvas();
        }
      })
      .exec();
  },

  getCenteredCanvasViewState(canvasWidth, canvasHeight, scale, screenWidth, screenHeight) {
    const nextScale = scale || 1;
    let sysInfo = {};
    if ((!screenWidth || !screenHeight) && typeof wx !== 'undefined' && wx.getSystemInfoSync) {
      sysInfo = wx.getSystemInfoSync() || {};
    }
    const viewportWidth = screenWidth || this.data.screenWidth || sysInfo.windowWidth || 0;
    const viewportHeight = screenHeight || this.data.screenHeight || sysInfo.windowHeight || 0;
    const width = canvasWidth || this.data.canvasWidth || 800;
    const height = canvasHeight || this.data.canvasHeight || 1000;
    return {
      scale: nextScale,
      translateX: viewportWidth / 2 - (width * nextScale) / 2,
      translateY: viewportHeight / 2 - (height * nextScale) / 2
    };
  },

  syncMainCanvasSize() {
    if (!this.mainCanvas || !this.context) return;
    const width = Math.max(1, Math.round(this.data.viewportWidth || this.data.screenWidth || 1));
    const height = Math.max(1, Math.round(this.data.viewportHeight || this.data.screenHeight || 1));
    const dpr = this.pixelRatio || 1;
    const realWidth = width * dpr;
    const realHeight = height * dpr;
    if (this.mainCanvas.width !== realWidth) this.mainCanvas.width = realWidth;
    if (this.mainCanvas.height !== realHeight) this.mainCanvas.height = realHeight;
    if (typeof this.context.setTransform === 'function') {
      this.context.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
  },

  clearMainCanvas() {
    if (!this.context || typeof this.context.clearRect !== 'function') return;
    this.syncMainCanvasSize();
    this.context.clearRect(0, 0, this.data.viewportWidth, this.data.viewportHeight);
  },

  getImageDrawSource(src, callback) {
    if (!src || !this.mainCanvas) {
      callback('');
      return;
    }
    if (!isCanvas2dContext(this.context)) {
      callback(src);
      return;
    }
    this.imageNodeCache = this.imageNodeCache || {};
    if (Object.prototype.hasOwnProperty.call(this.imageNodeCache, src)) {
      callback(this.imageNodeCache[src] || '');
      return;
    }
    this.imageLoads = this.imageLoads || {};
    if (this.imageLoads[src]) {
      this.imageLoads[src].push(callback);
      return;
    }
    this.imageLoads[src] = [callback];
    const img = this.mainCanvas.createImage();
    const finish = source => {
      const callbacks = this.imageLoads[src] || [];
      delete this.imageLoads[src];
      if (this.unloaded) return;
      this.imageNodeCache[src] = source;
      callbacks.forEach(done => done(source));
    };
    img.onload = () => finish(img);
    img.onerror = () => finish('');
    img.src = src;
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
      if (this.data.hasChanges) this.markChanged();
      return;
    }

    if (pending === this.data.currentFileId) {
      app.globalData.pendingFileId = '';
      return;
    }

    app.globalData.pendingFileId = '';

    if (this.data.hasChanges) {
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
    if (!this.discardDraft()) return;
    this.boardEpoch++;
    this.resetHistory();
    this.applyBoardData(file.data, { currentFileId: file.id, fileName: file.name || '', hasChanges: false, draftStatus: '', isSavingBoard: false });
  },

  applyBoardData(input, extra) {
    const normalized = boardData.normalizeBoard(input, true);
    const data = normalized.data;
    const savedTinctCurr = typeof data.tinctCurr === 'number' ? data.tinctCurr : 0;
    const savedCustomColor = data.customColor || '';
    const savedTinctList = this.data.tinctList || [];
    const savedPenColor = savedTinctCurr === -1 && savedCustomColor
      ? savedCustomColor
      : savedTinctList[savedTinctCurr] || savedTinctList[0] || '#000000';
    const graphObjects = data.graphObjects || [];
    const canvasWidth = data.canvasWidth || 800;
    const canvasHeight = data.canvasHeight || 1000;
    const scale = data.scale || 1;
    const hasSavedViewState = typeof data.translateX === 'number' && typeof data.translateY === 'number';
    const isLegacyDefaultView = hasSavedViewState &&
      canvasWidth === 800 &&
      canvasHeight === 1000 &&
      scale === 1 &&
      data.translateX === 0 &&
      data.translateY === 0;
    const shouldCenterView = !hasSavedViewState || (isLegacyDefaultView && graphObjects.length === 0);
    const viewState = shouldCenterView
      ? this.getCenteredCanvasViewState(canvasWidth, canvasHeight, scale)
      : {
        scale,
        translateX: data.translateX,
        translateY: data.translateY
      };
    this.setData(Object.assign({
      graphObjects,
      canvasBounds: data.canvasBounds || { minX: 0, maxX: 800, minY: 0, maxY: 1000 },
      canvasWidth,
      canvasHeight,
      brushState: data.brushState || 'p',
      tinctCurr: savedTinctCurr,
      tinctSize: data.tinctSize || 3,
      eraserSize: data.eraserSize || 20,
      customColor: savedCustomColor,
      currentPenIconColor: this.getPenIconColor(savedPenColor),
      currentMode: data.currentMode || 'draw',
      activeObjectId: null,
      isDrawing: false, isErasing: false, isDraggingObject: false, isZooming: false, isPanning: false
    }, viewState, extra || {}), () => {
      const app = getApp();
      if (app && app.globalData) app.globalData.currentEditingFileId = this.data.currentFileId;
      if (this.context) this.redrawCanvas();
    });
    if (normalized.dropped) wx.showToast({ title: '部分图片或笔迹无法恢复', icon: 'none' });
  },

  applyEmptyBoard(name) {
    if (!this.discardDraft()) return;
    this.boardEpoch++;
    this.resetHistory();
    const viewState = this.getCenteredCanvasViewState(800, 1000, 1);
    this.clearMainCanvas();
    this.setData(Object.assign({
      currentFileId: '',
      fileName: typeof name === 'string' ? name : '',
      hasChanges: false,
      draftStatus: '',
      isSavingBoard: false,
      isDrawing: false, isErasing: false, isDraggingObject: false, isZooming: false, isPanning: false,
      graphObjects: [],
      canvasBounds: { minX: 0, maxX: 800, minY: 0, maxY: 1000 },
      canvasWidth: 800,
      canvasHeight: 1000,
      activeObjectId: null,
      customColor: '',
      tinctCurr: 0,
      currentPenIconColor: this.getPenIconColor((this.data.tinctList || [])[0] || '#000000')
    }, viewState));
    const app = getApp();
    if (app && app.globalData) app.globalData.currentEditingFileId = '';
  },

  markChanged() {
    this.changeRevision = (this.changeRevision || 0) + 1;
    this.setData({ hasChanges: true, draftStatus: 'pending' });
    this.scheduleDraft();
  },

  resetHistory() {
    this.history = editHistory.createHistory(60);
    this.editBefore = null;
    this.pendingCanvasBoundsData = null;
    this.activePath = null;
    this.lastEraserPoint = null;
    this.ignoreSingleTouch = false;
    this.touchSession = null;
    this.edgeBackActive = false;
    this.touchSessionCancelled = false;
    this.setData({ canUndo: false, canRedo: false });
  },

  captureEditState() {
    return {
      objects: this.data.graphObjects.slice(), bounds: Object.assign({}, this.data.canvasBounds),
      scale: this.data.scale, translateX: this.data.translateX, translateY: this.data.translateY,
      activeObjectId: this.data.activeObjectId,
      hasChanges: this.data.hasChanges,
      draftStatus: this.data.draftStatus
    };
  },

  restoreEditState(state) {
    if (!state) return;
    const bounds = Object.assign({}, state.bounds);
    this.setData({
      graphObjects: state.objects.slice(),
      canvasBounds: bounds,
      canvasWidth: bounds.maxX - bounds.minX,
      canvasHeight: bounds.maxY - bounds.minY,
      scale: state.scale,
      scalePercent: Math.round(state.scale * 100),
      translateX: state.translateX,
      translateY: state.translateY,
      activeObjectId: state.activeObjectId || null,
      hasChanges: !!state.hasChanges,
      draftStatus: state.draftStatus || ''
    });
  },

  beginEdit() {
    if (!this.editBefore) this.editBefore = this.captureEditState();
  },

  commitEdit() {
    if (!this.editBefore) return;
    const changed = this.history.push(this.editBefore, this.captureEditState());
    this.editBefore = null;
    this.setData(this.history.state());
    if (changed) this.markChanged();
  },

  applyHistoryState(state) {
    if (!state) return;
    const bounds = Object.assign({}, state.bounds);
    this.setData(Object.assign({
      graphObjects: state.objects.slice(), canvasBounds: bounds,
      canvasWidth: bounds.maxX - bounds.minX, canvasHeight: bounds.maxY - bounds.minY,
      scale: state.scale, scalePercent: Math.round(state.scale * 100),
      translateX: state.translateX, translateY: state.translateY, activeObjectId: null
    }, this.history.state()));
    this.redrawCanvas();
    this.markChanged();
  },

  scheduleDraft() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    if (!this.data.hasChanges || this.unloaded || this.pageHidden) return;
    this.draftTimer = setTimeout(() => {
      this.draftTimer = null;
      if (this.data.isDrawing || this.data.isErasing || this.data.isDraggingObject || this.data.isZooming || this.data.isPanning) {
        this.scheduleDraft();
      } else this.flushDraft();
    }, 1000);
  },

  flushDraft() {
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    if (!this.data.hasChanges) return;
    const result = draftStore.write({
      currentFileId: this.data.currentFileId, fileName: this.data.fileName,
      data: this.buildBoardData()
    });
    this.setData({ draftStatus: result.ok ? 'saved' : 'error' });
    if (!result.ok && !this.draftErrorShown) {
      wx.showToast({ title: '草稿暂未保存，请及时手动保存', icon: 'none' });
      this.draftErrorShown = true;
    }
    if (result.ok) this.draftErrorShown = false;
  },

  discardDraft() {
    const result = draftStore.clear();
    if (!result.ok) {
      wx.showToast({ title: '暂时无法清理草稿，请稍后重试', icon: 'none' });
      return false;
    }
    if (this.draftTimer) clearTimeout(this.draftTimer);
    this.draftTimer = null;
    this.pendingCanvasBoundsData = null;
    return true;
  },

  restoreDraft() {
    const result = draftStore.read();
    if (result.error) {
      wx.showToast({ title: '上次草稿无法恢复', icon: 'none' });
      return;
    }
    if (!result.draft) return;
    const draft = result.draft;
    const fileId = draft.currentFileId && boardStore.getFile(draft.currentFileId) ? draft.currentFileId : '';
    this.restoredDraft = true;
    this.applyBoardData(draft.data, {
      currentFileId: fileId, fileName: draft.fileName || '', hasChanges: true, draftStatus: 'saved'
    });
    wx.showToast({ title: '已恢复上次草稿', icon: 'none' });
  },

  requestCanvasDraw() {
    if (this.renderTimer || this.pageHidden || this.unloaded) return;
    this.renderTimer = setTimeout(() => {
      this.renderTimer = null;
      if (!this.pageHidden && !this.unloaded) this.redrawCanvas();
    }, 16);
  },

  cancelCanvasDraw() {
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = null;
  },

  // ---------- 新建画板 ----------

  createNewBoard(name) {
    const title = typeof name === 'string' ? name : '';
    const hasContent = (this.data.graphObjects && this.data.graphObjects.length > 0) || !!this.data.currentFileId;
    if (!hasContent) {
      this.applyEmptyBoard(title);
      return;
    }
    if (!this.data.hasChanges) {
      this.applyEmptyBoard(title);
      return;
    }
    wx.showModal({
      title: '新建画板？',
      content: '当前画板尚有未保存的修改，新建后将丢失这些修改。',
      confirmText: '新建',
      cancelText: '取消',
      confirmColor: '#2563EB',
      success: res => {
        if (res.confirm) this.applyEmptyBoard(title);
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

  getPenIconColor(color) {
    const parsed = parseColor(color || '#000000');
    if (parsed.a <= 0) return '#000000';
    return rgbToHex(parsed.r, parsed.g, parsed.b);
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
    this.setTabBarHidden(true);
    this.applyPickerColor(parseColor(current), {
      showColorPicker: true,
      pickerTab: 'grid'
    });
  },

  closeColorPicker() {
    this.setTabBarHidden(false);
    this.setData({ showColorPicker: false });
  },

  switchPickerTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab) return;
    this.setData({ pickerTab: tab });
  },

  buildPickerColor(r, g, b, alpha) {
    const a = Math.max(0, Math.min(100, Math.round(alpha)));
    if (a >= 100) return rgbToHex(r, g, b);
    return 'rgba(' + Math.round(r) + ', ' + Math.round(g) + ', ' + Math.round(b) + ', ' + (a / 100).toFixed(2) + ')';
  },

  buildPickerData(rgb, extraData) {
    const r = Math.max(0, Math.min(255, Math.round(rgb.r)));
    const g = Math.max(0, Math.min(255, Math.round(rgb.g)));
    const b = Math.max(0, Math.min(255, Math.round(rgb.b)));
    const alpha = typeof rgb.a === 'number' ? Math.max(0, Math.min(100, Math.round(rgb.a))) : this.data.pickerAlpha;
    const spectrumPoint = spectrumPointFromRgb({ r, g, b });
    return Object.assign({
      pickerColor: this.buildPickerColor(r, g, b, alpha),
      pickerHex: rgbToHex(r, g, b).slice(1).toUpperCase(),
      pickerRed: r,
      pickerGreen: g,
      pickerBlue: b,
      pickerAlpha: alpha,
      pickerSpectrumX: spectrumPoint.x,
      pickerSpectrumY: spectrumPoint.y,
      pickerRedThumbPct: sliderThumbLinePct(r, 255),
      pickerGreenThumbPct: sliderThumbLinePct(g, 255),
      pickerBlueThumbPct: sliderThumbLinePct(b, 255),
      pickerAlphaThumbPct: sliderThumbLinePct(alpha, 100)
    }, extraData || {});
  },

  applyPickerColor(rgb, extraData) {
    const data = this.buildPickerData(rgb, extraData);
    this.setData(data);
  },

  commitPickerColor(rgb, extraData) {
    const data = this.buildPickerData(rgb);
    const color = data.pickerColor || '#000000';
    const tinctList = this.data.tinctList || [];
    const presetIndex = tinctList.indexOf(color);
    this.setData(Object.assign(data, extraData || {}, {
      customColor: presetIndex >= 0 ? '' : color,
      tinctCurr: presetIndex >= 0 ? presetIndex : -1,
      currentPenIconColor: this.getPenIconColor(color),
      brushState: 'p',
      currentMode: 'draw'
    }));
    this.scheduleDraft();
  },

  onGridColorPick(e) {
    const color = e.currentTarget.dataset.color;
    if (!color) return;
    const rgb = hexToRgb(color);
    const extraData = {};
    const spectrumX = Number(e.currentTarget.dataset.spectrumX);
    const spectrumY = Number(e.currentTarget.dataset.spectrumY);
    if (Number.isFinite(spectrumX) && Number.isFinite(spectrumY)) {
      extraData.pickerSpectrumX = spectrumX;
      extraData.pickerSpectrumY = spectrumY;
    }
    this.commitPickerColor({ r: rgb.r, g: rgb.g, b: rgb.b, a: this.data.pickerAlpha }, extraData);
  },

  updateSpectrumFromTouch(e, shouldCommit) {
    const touch = (e.touches && e.touches[0]) || e.changedTouches && e.changedTouches[0];
    if (!touch) return;
    wx.createSelectorQuery()
      .in(this)
      .select('.spectrum-touch-target')
      .boundingClientRect(rect => {
        if (!rect || !rect.width || !rect.height) return;
        const nx = Math.max(0, Math.min(1, (touch.clientX - rect.left) / rect.width));
        const ny = Math.max(0, Math.min(1, (touch.clientY - rect.top) / rect.height));
        const rgb = spectrumRgbFromPoint(nx, ny);
        const next = { r: rgb.r, g: rgb.g, b: rgb.b, a: this.data.pickerAlpha };
        this.commitPickerColor(next, {
          pickerSpectrumX: sliderThumbLinePct(nx, 1),
          pickerSpectrumY: sliderThumbLinePct(ny, 1)
        });
      })
      .exec();
  },

  onSpectrumPick(e) {
    this.updateSpectrumFromTouch(e, false);
  },

  onSpectrumCommit(e) {
    this.updateSpectrumFromTouch(e, true);
  },

  /** 触点映射：x 从左/右圆帽圆心算起，行程 length−height，与 thumb-lane 一致 */
  onPickerSliderTouch(e) {
    const touch = (e.touches && e.touches[0]) || (e.changedTouches && e.changedTouches[0]);
    if (!touch) return;

    const maxVal = Number(e.currentTarget.dataset.max);
    const channel = e.currentTarget.dataset.channel;
    const trackId = e.currentTarget.dataset.trackId;
    if (!trackId || !channel || !Number.isFinite(maxVal)) return;

    const queryId = '#' + trackId;

    wx.createSelectorQuery()
      .in(this)
      .select(queryId)
      .boundingClientRect(rect => {
        if (!rect || !rect.width) return;

        const capR = rect.height / 2;
        const travel = Math.max(rect.width - 2 * capR, 1);
        let x = touch.clientX - rect.left - capR;
        let ratio = x / travel;
        ratio = Math.max(0, Math.min(1, ratio));

        let value = Math.round(ratio * maxVal);

        const rgb = {
          r: this.data.pickerRed,
          g: this.data.pickerGreen,
          b: this.data.pickerBlue,
          a: this.data.pickerAlpha
        };
        if (channel === 'a') rgb.a = value;
        else if (channel === 'r') rgb.r = value;
        else if (channel === 'g') rgb.g = value;
        else if (channel === 'b') rgb.b = value;

        this.commitPickerColor(rgb);
      })
      .exec();
  },

  onHexInput(e) {
    const value = (e.detail.value || '').replace(/[^0-9a-fA-F]/g, '').slice(0, 6).toUpperCase();
    this.setData({ pickerHex: value });
    if (value.length !== 6) return;
    const rgb = hexToRgb('#' + value);
    this.commitPickerColor({ r: rgb.r, g: rgb.g, b: rgb.b, a: this.data.pickerAlpha });
  },

  onPresetPick(e) {
    const color = e.currentTarget.dataset.color;
    if (!color) return;
    const rgb = parseColor(color);
    rgb.a = this.data.pickerAlpha;
    this.applyPickerColor(rgb);
  },

  confirmCustomColor() {
    const color = this.data.pickerColor || '#000000';
    const tinctList = this.data.tinctList || [];
    const presetIndex = tinctList.indexOf(color);
    this.setTabBarHidden(false);
    this.setData({
      customColor: presetIndex >= 0 ? '' : color,
      tinctCurr: presetIndex >= 0 ? presetIndex : -1,
      currentPenIconColor: this.getPenIconColor(color),
      brushState: 'p',
      currentMode: 'draw',
      showColorPicker: false
    });
  },

  // ---------- 首次使用 ----------

  checkFirstTimeUser() {
    if (this.restoredDraft) return;
    try {
      if (!wx.getStorageSync(TUTORIAL_STORAGE_KEY)) {
        this.tutorialTimer = setTimeout(() => {
          if (!this.unloaded && !this.pageHidden) this.showTutorialModal();
        }, 500);
      }
    } catch (e) {
      console.error('检查首次使用状态失败:', e);
    }
  },

  initTutorialDot() {
    try {
      this.setData({
        showTutorialDot: !wx.getStorageSync(TUTORIAL_DOT_STORAGE_KEY)
      });
    } catch (e) {
      console.error('读取说明提示状态失败:', e);
    }
  },

  markTutorialDotRead() {
    if (!this.data.showTutorialDot) return;
    this.setData({ showTutorialDot: false });
    try {
      wx.setStorageSync(TUTORIAL_DOT_STORAGE_KEY, true);
    } catch (e) {
      console.error('保存说明提示状态失败:', e);
    }
  },

  showTutorialModal() {
    this.setTabBarHidden(false);
    this.setData({ showTutorial: true });
  },

  openTutorial() {
    this.markTutorialDotRead();
    this.showTutorialModal();
  },

  closeTutorial() {
    this.setTabBarHidden(false);
    this.setData({ showTutorial: false });
    try {
      wx.setStorageSync(TUTORIAL_STORAGE_KEY, true);
    } catch (e) {
      console.error('保存使用状态失败:', e);
    }
  },

  stopPropagation() {},

  // ---------- 坐标 / 边界 ----------

  getCanvasContentOffset() {
    const bounds = this.data.canvasBounds || { minX: 0, minY: 0 };
    return {
      x: -(bounds.minX || 0),
      y: -(bounds.minY || 0)
    };
  },

  screenToCanvas(screenX, screenY) {
    const offset = this.getCanvasContentOffset();
    return {
      x: (screenX - this.data.translateX) / this.data.scale - offset.x,
      y: (screenY - this.data.translateY) / this.data.scale - offset.y
    };
  },

  getDistance(t1, t2) {
    const first = getTouchPosition(t1);
    const second = getTouchPosition(t2);
    const dx = first.x - second.x;
    const dy = first.y - second.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  expandCanvasBounds(x, y, deferSync) {
    const bounds = this.data.canvasBounds;
    const prevOffset = this.getCanvasContentOffset();
    let needUpdate = false;
    const padding = 50;
    if (x < bounds.minX) { bounds.minX = Math.floor(x - padding); needUpdate = true; }
    if (x > bounds.maxX) { bounds.maxX = Math.ceil(x + padding); needUpdate = true; }
    if (y < bounds.minY) { bounds.minY = Math.floor(y - padding); needUpdate = true; }
    if (y > bounds.maxY) { bounds.maxY = Math.ceil(y + padding); needUpdate = true; }
    if (needUpdate) {
      const nextOffset = {
        x: -(bounds.minX || 0),
        y: -(bounds.minY || 0)
      };
      const nextData = {
        canvasBounds: bounds,
        canvasWidth: bounds.maxX - bounds.minX,
        canvasHeight: bounds.maxY - bounds.minY,
        translateX: this.data.translateX + (prevOffset.x - nextOffset.x) * this.data.scale,
        translateY: this.data.translateY + (prevOffset.y - nextOffset.y) * this.data.scale
      };
      Object.assign(this.data, nextData);
      if (deferSync) {
        this.pendingCanvasBoundsData = Object.assign({}, this.pendingCanvasBoundsData || {}, nextData);
      } else {
        this.setData(nextData);
      }
    }
    return needUpdate;
  },

  // ---------- 触摸事件 ----------

  hasActiveTouch() {
    return !!(this.editBefore || this.touchSession || this.data.isDrawing || this.data.isErasing ||
      this.data.isDraggingObject || this.data.isPanning || this.data.isZooming);
  },

  resetTouchState(showScaleToast) {
    const keepScaleToast = !!showScaleToast;
    this.touchSession = null;
    this.edgeBackActive = false;
    this.touchSessionCancelled = false;
    this.activePath = null;
    this.lastEraserPoint = null;
    this.pendingCanvasBoundsData = null;
    this.setData({
      isDrawing: false,
      isErasing: false,
      isPanning: false,
      isZooming: false,
      isDraggingObject: false,
      lastPanPoint: null,
      lastDragPoint: null,
      lastTouchDistance: 0,
      showScaleToast: keepScaleToast
    });
  },

  beginTouchSession(touch) {
    const position = getTouchPosition(touch);
    this.touchSession = {
      identifier: getTouchIdentifier(touch),
      start: position,
      last: position,
      // Keep the guard narrow enough that a normal horizontal stroke beginning
      // near the canvas edge still works; iOS edge-back starts within roughly
      // the first 16px and produces a short rightward move first.
      edgeCandidate: position.x <= 16
    };
    this.edgeBackActive = false;
    this.touchSessionCancelled = false;
  },

  maybeStartEdgeBackGesture(touch) {
    const session = this.touchSession;
    if (!session || session.edgeBackActive || !session.edgeCandidate) return false;
    const position = getTouchPosition(touch);
    const dx = position.x - session.start.x;
    const dy = position.y - session.start.y;
    session.last = position;
    if (dx >= 12 && dx <= 36 && dx > Math.abs(dy) * 1.2) {
      this.edgeBackActive = true;
      session.edgeBackActive = true;
      this.cancelGestureEdit();
      this.ignoreSingleTouch = true;
      return true;
    }
    return false;
  },

  cancelGestureEdit() {
    const before = this.editBefore;
    if (before) this.restoreEditState(before);
    this.editBefore = null;
    this.touchSessionCancelled = true;
    this.resetTouchState(false);
    this.ignoreSingleTouch = true;
    this.cancelCanvasDraw();
    this.redrawCanvas();
  },

  touchstart(e) {
    if (this.data.showColorPicker || this.data.showTutorial || !this.context) return;
    const touches = e.touches || [];
    if (touches.length >= 2) {
      this.finishGestureEdit();
      const first = getTouchPosition(touches[0]);
      const second = getTouchPosition(touches[1]);
      this.touchSession = null;
      this.ignoreSingleTouch = true;
      this.setData({
        isDrawing: false, isErasing: false, isDraggingObject: false, isPanning: false, isZooming: true,
        lastTouchDistance: Math.max(this.getDistance(touches[0], touches[1]), 1),
        lastPanPoint: { x: (first.x + second.x) / 2, y: (first.y + second.y) / 2 }
      });
      return;
    }
    if (touches.length !== 1 || this.ignoreSingleTouch) return;
    const touch = touches[0];
    const position = getTouchPosition(touch);
    const point = this.screenToCanvas(position.x, position.y);
    this.beginTouchSession(touch);
    if (this.data.currentMode === 'select') {
      const objects = this.data.graphObjects;
      const hit = objects.slice().reverse().find(object => geometry.hitTest(object, point, 8 / this.data.scale));
      this.setData({
        activeObjectId: hit ? hit.id : null,
        isDraggingObject: !!hit, isPanning: !hit,
        lastDragPoint: { x: position.x, y: position.y },
        lastPanPoint: hit ? null : { x: position.x, y: position.y }
      });
      if (hit) this.beginEdit();
      this.redrawCanvas();
      return;
    }
    this.beginEdit();
    this.setData({ activeObjectId: null });
    if (this.data.brushState === 'c') {
      this.setData({ isErasing: true });
      this.lastEraserPoint = point;
      this.eraseTo(point);
      return;
    }
    const newPath = {
      id: 'path_' + boardStore.uuidv4(), type: 'path', smooth: true,
      x: 0, y: 0, points: [point],
      style: { color: this.getCurrentColor(), width: this.data.tinctSize || 3 },
      itemBox: geometry.bounds([point])
    };
    this.activePath = newPath;
    this.data.graphObjects.push(newPath);
    this.setData({ isDrawing: true });
    this.expandCanvasBounds(point.x, point.y, true);
    this.requestCanvasDraw();
  },

  eraseTo(point) {
    const from = this.lastEraserPoint || point;
    this.data.graphObjects = geometry.eraseObjects(this.data.graphObjects, from, point, this.data.eraserSize / 2);
    this.lastEraserPoint = point;
    this.requestCanvasDraw();
  },

  appendStrokePoint(touch, force) {
    const path = this.activePath;
    if (!path || !touch) return;
    const position = getTouchPosition(touch);
    const point = this.screenToCanvas(position.x, position.y);
    const last = path.points[path.points.length - 1];
    const distance = Math.hypot(point.x - last.x, point.y - last.y);
    if (distance < (force ? 0.01 : 0.8 / this.data.scale)) return;
    path.points.push(point);
    path.itemBox.minX = Math.min(path.itemBox.minX, point.x);
    path.itemBox.maxX = Math.max(path.itemBox.maxX, point.x);
    path.itemBox.minY = Math.min(path.itemBox.minY, point.y);
    path.itemBox.maxY = Math.max(path.itemBox.maxY, point.y);
    this.expandCanvasBounds(point.x, point.y, true);
    this.requestCanvasDraw();
  },

  touchMove(e) {
    if (this.data.showColorPicker || this.data.showTutorial || !this.context) return;
    const touches = e.touches || [];
    if (touches.length >= 2 && !this.data.isZooming) {
      this.touchstart(e);
      return;
    }
    if (this.data.isZooming && touches.length >= 2) {
      const distance = Math.max(this.getDistance(touches[0], touches[1]), 1);
      const oldScale = this.data.scale;
      const scale = Math.max(0.05, Math.min(20, oldScale * distance / this.data.lastTouchDistance));
      const center = { x: (touches[0].x + touches[1].x) / 2, y: (touches[0].y + touches[1].y) / 2 };
      const previous = this.data.lastPanPoint;
      Object.assign(this.data, {
        scale,
        translateX: center.x - (previous.x - this.data.translateX) * scale / oldScale,
        translateY: center.y - (previous.y - this.data.translateY) * scale / oldScale,
        lastTouchDistance: distance, lastPanPoint: center
      });
      this.setData({ scalePercent: Math.round(scale * 100), showScaleToast: true });
      this.requestCanvasDraw();
      return;
    }
    if (touches.length !== 1 || this.ignoreSingleTouch) return;
    const touch = touches[0];
    if (this.maybeStartEdgeBackGesture(touch)) return;
    const position = getTouchPosition(touch);
    if (this.data.isDraggingObject && this.data.activeObjectId) {
      const dx = (position.x - this.data.lastDragPoint.x) / this.data.scale;
      const dy = (position.y - this.data.lastDragPoint.y) / this.data.scale;
      const index = this.data.graphObjects.findIndex(object => object.id === this.data.activeObjectId);
      if (index >= 0 && (dx || dy)) {
        const old = this.data.graphObjects[index];
        const object = Object.assign({}, old, { x: (old.x || 0) + dx, y: (old.y || 0) + dy });
        this.data.graphObjects[index] = object;
        this.expandCanvasBounds(object.x + object.itemBox.minX, object.y + object.itemBox.minY, true);
        this.expandCanvasBounds(object.x + object.itemBox.maxX, object.y + object.itemBox.maxY, true);
        this.data.lastDragPoint = { x: position.x, y: position.y };
        this.requestCanvasDraw();
      }
    } else if (this.data.isDrawing) {
      this.appendStrokePoint(touch, false);
    } else if (this.data.isErasing) {
      this.eraseTo(this.screenToCanvas(position.x, position.y));
    } else if (this.data.isPanning && this.data.lastPanPoint) {
      this.data.translateX += position.x - this.data.lastPanPoint.x;
      this.data.translateY += position.y - this.data.lastPanPoint.y;
      this.data.lastPanPoint = { x: position.x, y: position.y };
      this.requestCanvasDraw();
    }
  },

  finishGestureEdit() {
    if (this.pendingCanvasBoundsData) {
      this.setData(this.pendingCanvasBoundsData);
      this.pendingCanvasBoundsData = null;
    }
    this.commitEdit();
    this.activePath = null;
    this.lastEraserPoint = null;
  },

  touchEnd(e) {
    const wasZooming = this.data.isZooming;
    this.finishGestureEdit();
    this.ignoreSingleTouch = !!(e && e.touches && e.touches.length);
    this.resetTouchState(wasZooming);
    this.cancelCanvasDraw();
    this.redrawCanvas();
    this.scheduleDraft();
    if (wasZooming && !this.pageHidden) {
      if (this.scaleToastTimer) clearTimeout(this.scaleToastTimer);
      this.scaleToastTimer = setTimeout(() => {
        this.scaleToastTimer = null;
        if (!this.unloaded) this.setData({ showScaleToast: false });
      }, 250);
    }
  },

  touchCancel() {
    this.cancelGestureEdit();
  },

  // ---------- 绘制 ----------

  bindDraw() {
    this.requestCanvasDraw();
  },

  renderToContext(ctx, width, height, scale, tx, ty, isExport, contentOffset) {
    const asyncImageTasks = [];
    const offsetX = contentOffset && typeof contentOffset.x === 'number' ? contentOffset.x : 0;
    const offsetY = contentOffset && typeof contentOffset.y === 'number' ? contentOffset.y : 0;
    ctx.clearRect(0, 0, width, height);
    if (isExport) {
      setFillStyleCompat(ctx, '#ffffff');
      ctx.fillRect(0, 0, width, height);
    }
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(tx / scale + offsetX, ty / scale + offsetY);
    const objects = this.data.graphObjects;
    if (!isExport) {
      const buffer = 100;
      const vX = -tx / scale - offsetX - buffer;
      const vY = -ty / scale - offsetY - buffer;
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
        this.drawObject(ctx, obj, false, asyncImageTasks);
      }
    } else {
      for (let i = 0; i < objects.length; i++) {
        this.drawObject(ctx, objects[i], true, asyncImageTasks);
      }
    }
    ctx.restore();
    return asyncImageTasks;
  },

  redrawCanvas() {
    if (!this.context || typeof this.context.clearRect !== 'function' || this.unloaded) return;
    this.syncMainCanvasSize();
    const offset = this.getCanvasContentOffset();
    const asyncImageTasks = this.renderToContext(
      this.context,
      this.data.viewportWidth,
      this.data.viewportHeight,
      this.data.scale,
      this.data.translateX,
      this.data.translateY,
      false,
      offset
    );
    if (asyncImageTasks && asyncImageTasks.length) {
      let pending = asyncImageTasks.length;
      let shouldRedraw = false;
      const done = loaded => {
        shouldRedraw = shouldRedraw || !!loaded;
        pending--;
        if (pending <= 0 && shouldRedraw) this.requestCanvasDraw();
      };
      asyncImageTasks.forEach(task => task(done));
    }
    flushCanvasCompat(this.context, false);
  },

  drawObject(ctx, obj, hideSelection, asyncImageTasks) {
    if (obj.type === 'path') {
      geometry.drawPath(ctx, obj);
    } else if (obj.type === 'image') {
      if (isCanvas2dContext(ctx)) {
        const cached = this.imageNodeCache && this.imageNodeCache[obj.src];
        if (cached) {
          ctx.drawImage(cached, obj.x, obj.y, obj.w, obj.h);
        } else if (asyncImageTasks) {
          asyncImageTasks.push(done => {
            this.getImageDrawSource(obj.src, source => {
              if (typeof done === 'function') done(!!source);
            });
          });
        }
      } else {
        ctx.drawImage(obj.src, obj.x, obj.y, obj.w, obj.h);
      }
    }

    if (!hideSelection && this.data.activeObjectId === obj.id) {
      setStrokeStyleCompat(ctx, '#2563EB');
      setLineWidthCompat(ctx, 2);
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
    this.touchEnd();
    this.setData({
      currentMode: e.currentTarget.dataset.mode,
      activeObjectId: null
    });
    this.redrawCanvas();
    this.scheduleDraft();
  },

  switchBrush(e) {
    this.touchEnd();
    this.setData({
      currentMode: 'draw',
      brushState: e.currentTarget.dataset.state,
      activeObjectId: null
    });
    this.redrawCanvas();
    this.scheduleDraft();
  },

  tinColorChange(e) {
    const index = Number(e.currentTarget.dataset.index);
    const color = (this.data.tinctList || [])[index] || '#000000';
    this.setData({
      tinctCurr: index,
      currentPenIconColor: this.getPenIconColor(color),
      brushState: 'p',
      currentMode: 'draw'
    });
    this.scheduleDraft();
  },

  tinSizechange(e) {
    this.setData({ tinctSize: e.detail.value });
    this.scheduleDraft();
  },

  eraserSizeChange(e) {
    this.setData({ eraserSize: Math.max(8, Math.min(80, Number(e.detail.value) || 20)) });
    this.scheduleDraft();
  },

  adjustSize(e) {
    const delta = Number(e.currentTarget.dataset.delta) || 0;
    let next = (this.data.tinctSize || 3) + delta;
    if (next < 1) next = 1;
    if (next > 10) next = 10;
    this.setData({ tinctSize: next });
    this.scheduleDraft();
  },

  drawBack() {
    this.touchEnd();
    this.applyHistoryState(this.history.undo());
  },

  drawRedo() {
    this.touchEnd();
    this.applyHistoryState(this.history.redo());
  },

  deleteSelected() {
    this.touchEnd();
    const id = this.data.activeObjectId;
    if (!id || !this.data.graphObjects.some(object => object.id === id)) return;
    this.beginEdit();
    this.data.graphObjects = this.data.graphObjects.filter(object => object.id !== id);
    this.setData({ activeObjectId: null });
    this.commitEdit();
    this.redrawCanvas();
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
    this.touchEnd();
    this.beginEdit();
    const viewState = this.getCenteredCanvasViewState(800, 1000, 1);
    this.clearMainCanvas();
    this.setData(Object.assign({
      graphObjects: [],
      activeObjectId: null,
      canvasBounds: { minX: 0, maxX: 800, minY: 0, maxY: 1000 },
      canvasWidth: 800,
      canvasHeight: 1000
    }, viewState));
    this.commitEdit();
  },

  chooseImage() {
    const that = this;
    const epoch = this.boardEpoch;
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: res => {
        const tempFilePath = res.tempFilePaths[0];
        wx.getImageInfo({
          src: tempFilePath,
          success: info => {
            that.persistTempFile(tempFilePath, savedPath => {
              if (that.unloaded || epoch !== that.boardEpoch) return;
              if (!savedPath) {
                wx.showToast({ title: '图片保存失败，请重试', icon: 'none' });
                return;
              }
              that.touchEnd();
              const ratio = info.width / info.height;
              const w = 200;
              const h = 200 / (ratio || 1);
              const cx = that.data.screenWidth / 2;
              const cy = that.data.screenHeight / 2;
              const canvasPos = that.screenToCanvas(cx, cy);
              const newImg = {
                id: 'img_' + boardStore.uuidv4(),
                type: 'image',
                src: savedPath || tempFilePath,
                x: canvasPos.x - w / 2,
                y: canvasPos.y - h / 2,
                w: w,
                h: h,
                itemBox: { minX: 0, maxX: w, minY: 0, maxY: h }
              };
              that.beginEdit();
              that.data.graphObjects.push(newImg);
              that.expandCanvasBounds(newImg.x, newImg.y);
              that.expandCanvasBounds(newImg.x + w, newImg.y + h);
              that.redrawCanvas();
              that.commitEdit();
            });
          }
        });
      }
    });
  },

  persistTempFile(tempFilePath, callback) {
    if (!tempFilePath || !wx.saveFile) {
      callback('');
      return;
    }
    wx.saveFile({
      tempFilePath,
      success: res => callback(res.savedFilePath || ''),
      fail: () => callback('')
    });
  },

  // ---------- 导出到相册 ----------

  exportImage() {
    if (this.data.isExportingImage || this.data.isSavingBoard) return;
    if (!this.data.graphObjects || this.data.graphObjects.length === 0) {
      wx.showToast({ title: '画板为空', icon: 'none' });
      return;
    }
    this.requireExportAd(() => this.doExportImage());
  },

  requireExportAd(callback) {
    if (!this.exportImageAd) {
      wx.showToast({ title: '广告未初始化，请稍后再试', icon: 'none' });
      return;
    }
    const epoch = this.boardEpoch;
    this.exportImageAd.show((ok, message) => {
      if (this.unloaded || this.boardEpoch !== epoch) return;
      if (!ok) {
        if (message) wx.showToast({ title: message, icon: 'none' });
        return;
      }
      if (typeof callback === 'function') callback();
    });
  },

  doExportImage() {
    if (this.data.isExportingImage || this.data.isSavingBoard) return;
    this.touchEnd();
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
      this.renderToContext(exportCtx, exportWidth, exportHeight, renderScale, tx, ty, true, { x: 0, y: 0 });
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
    if (this.data.isSavingBoard || this.data.isExportingImage) return;
    if (this.data.graphObjects.length === 0 && !this.data.currentFileId) {
      wx.showToast({ title: '画板为空，无需保存', icon: 'none' });
      return;
    }

    if (!this.canSaveCurrentBoard()) {
      this.requireSaveFileAd(() => {
        fileUnlockStore.unlockNextFile(boardStore.getFiles().length);
        this.doSaveBoard();
      });
      return;
    }

    this.doSaveBoard();
  },

  canSaveCurrentBoard() {
    return fileUnlockStore.canCreateFile(this.data.currentFileId, boardStore.getFiles().length);
  },

  requireSaveFileAd(callback) {
    if (!this.saveFileAd) {
      wx.showToast({ title: '广告未初始化，请稍后再试', icon: 'none' });
      return;
    }
    const epoch = this.boardEpoch;
    this.saveFileAd.show((ok, message) => {
      if (this.unloaded || this.boardEpoch !== epoch) return;
      if (!ok) {
        if (message) wx.showToast({ title: message, icon: 'none' });
        return;
      }
      if (typeof callback === 'function') callback();
    });
  },

  doSaveBoard() {
    if (this.data.isSavingBoard || this.data.isExportingImage) return;
    this.touchEnd();
    if (this.data.draftStatus !== 'saved') this.flushDraft();
    const epoch = this.boardEpoch;
    const revision = this.changeRevision;
    const payload = {
      id: this.data.currentFileId, name: this.data.fileName,
      data: JSON.parse(JSON.stringify(this.buildBoardData()))
    };
    this.setData({ isSavingBoard: true });
    wx.showLoading({ title: '正在保存...', mask: true });

    this.generateThumbnail(thumbnail => {
      if (this.unloaded || epoch !== this.boardEpoch) {
        wx.hideLoading();
        return;
      }
      const result = boardStore.saveFile({
        id: payload.id,
        name: payload.name,
        thumbnail,
        data: payload.data
      });
      wx.hideLoading();
      this.setData({ isSavingBoard: false });
      if (!result.ok) {
        wx.showToast({ title: result.message || '保存失败，请稍后重试', icon: 'none' });
        return;
      }
      const app = getApp();
      if (app && app.globalData) app.globalData.currentEditingFileId = result.file.id;
      const clean = revision === this.changeRevision && !this.editBefore;
      this.setData({
        currentFileId: result.file.id,
        fileName: result.file.name,
        hasChanges: !clean
      });
      if (clean) {
        const cleared = this.discardDraft();
        this.setData({ draftStatus: cleared ? '' : 'error', hasChanges: !cleared });
        if (!cleared) this.flushDraft();
      } else if (this.editBefore) this.scheduleDraft();
      else this.flushDraft();
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
      eraserSize: this.data.eraserSize,
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
      this.renderToContext(exportCtx, thumbSize, thumbSize, scale, tx, ty, true, { x: 0, y: 0 });
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
