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
      this.getTabBar().setData({
        selected: 0,
        hidden: !!(this.data.showTutorial || this.data.showColorPicker)
      });
    }
    this.consumePendingFileId(false);
  },

  onReady() {
    const sysInfo = wx.getSystemInfoSync();
    this.pixelRatio = sysInfo.pixelRatio || 1;
    this.setData({
      screenWidth: sysInfo.windowWidth,
      screenHeight: sysInfo.windowHeight
    });
    this.initMainCanvas();
    this.checkFirstTimeUser();
  },

  initMainCanvas() {
    wx.createSelectorQuery()
      .in(this)
      .select('#palette')
      .fields({ node: true, size: true }, res => {
        if (!res || !res.node) return;
        this.mainCanvas = res.node;
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

  syncMainCanvasSize() {
    if (!this.mainCanvas || !this.context) return;
    const width = Math.max(1, Math.round(this.data.canvasWidth || 1));
    const height = Math.max(1, Math.round(this.data.canvasHeight || 1));
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
    if (!this.context) return;
    this.syncMainCanvasSize();
    this.context.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
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
    this.clearMainCanvas();
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
      brushState: 'p',
      currentMode: 'draw'
    }));
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
      brushState: 'p',
      currentMode: 'draw',
      showColorPicker: false
    });
  },

  // ---------- 首次使用 ----------

  checkFirstTimeUser() {
    try {
      if (!wx.getStorageSync('hasUsedNotePaint')) {
        setTimeout(() => {
          this.openTutorial();
        }, 500);
      }
    } catch (e) {
      console.error('检查首次使用状态失败:', e);
    }
  },

  openTutorial() {
    this.setTabBarHidden(true);
    this.setData({ showTutorial: true });
  },

  closeTutorial() {
    this.setTabBarHidden(false);
    this.setData({ showTutorial: false });
    try {
      wx.setStorageSync('hasUsedNotePaint', true);
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
    const dx = t1.x - t2.x;
    const dy = t1.y - t2.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  expandCanvasBounds(x, y) {
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
      this.setData({
        canvasBounds: bounds,
        canvasWidth: bounds.maxX - bounds.minX,
        canvasHeight: bounds.maxY - bounds.minY,
        translateX: this.data.translateX + (prevOffset.x - nextOffset.x) * this.data.scale,
        translateY: this.data.translateY + (prevOffset.y - nextOffset.y) * this.data.scale
      });
    }
  },

  // ---------- 触摸事件 ----------

  touchstart(e) {
    if (this.data.showColorPicker || this.data.showTutorial) return;
    if (!this.context) return;
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

      setStrokeStyleCompat(this.context, tinct);
      setLineWidthCompat(this.context, lineWidth);
      setLineCapCompat(this.context, 'round');
      setLineJoinCompat(this.context, 'round');

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
    if (this.data.showColorPicker || this.data.showTutorial) return;
    if (!this.context) return;
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
    if (this.data.showColorPicker || this.data.showTutorial) return;
    if (!this.context) return;
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
    this.syncMainCanvasSize();
    const offset = this.getCanvasContentOffset();
    this.context.save();
    this.context.scale(this.data.scale, this.data.scale);
    this.context.translate(
      this.data.translateX / this.data.scale + offset.x,
      this.data.translateY / this.data.scale + offset.y
    );
    this.context.beginPath();
    this.context.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      this.context.lineTo(points[i].x, points[i].y);
    }
    this.context.stroke();
    this.context.restore();
    flushCanvasCompat(this.context, true);
  },

  renderToContext(ctx, width, height, scale, tx, ty, isExport, contentOffset) {
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
    if (!this.context) return;
    this.syncMainCanvasSize();
    const offset = this.getCanvasContentOffset();
    this.renderToContext(
      this.context,
      this.data.canvasWidth,
      this.data.canvasHeight,
      this.data.scale,
      this.data.translateX,
      this.data.translateY,
      false,
      offset
    );
    flushCanvasCompat(this.context, false);
  },

  drawObject(ctx, obj, hideSelection) {
    if (obj.type === 'path') {
      if (obj.points.length > 0) {
        setStrokeStyleCompat(ctx, obj.style.color);
        setLineWidthCompat(ctx, obj.style.width);
        setLineCapCompat(ctx, 'round');
        setLineJoinCompat(ctx, 'round');
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
    this.clearMainCanvas();
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
