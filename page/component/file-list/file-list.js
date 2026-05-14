const boardStore = require('../../../utils/boardStore');
const rewardedVideoAd = require('../../../utils/rewardedVideoAd');
const share = require('../../../utils/share');

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

Page({
  data: {
    files: [],
    filtered: [],
    keyword: '',
    hasFiles: false,
    renameVisible: false,
    renameId: '',
    renameValue: '',
    isExportingImage: false,
    exportWidth: 0,
    exportHeight: 0
  },

  onLoad() {
    share.enableShareMenu();
    this.exportImageAd = rewardedVideoAd.createRewardedVideoAd(rewardedVideoAd.EXPORT_IMAGE_AD_UNIT_ID, {
      cancelMessage: '完整观看广告后才能导出',
      errorMessage: '广告暂不可用，请稍后再试'
    });
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.refreshFiles();
  },

  onShareAppMessage() {
    return share.getShareInfo();
  },

  onShareTimeline() {
    return share.getTimelineInfo();
  },

  onUnload() {
    if (this.exportImageAd && this.exportImageAd.destroy) this.exportImageAd.destroy();
  },

  refreshFiles() {
    const files = boardStore.getFiles().map(item => Object.assign({}, item, {
      updatedAtText: boardStore.formatTime(item.updatedAt)
    }));
    this.setData({
      files,
      hasFiles: files.length > 0
    });
    this.applyFilter();
  },

  applyFilter() {
    const keyword = (this.data.keyword || '').trim().toLowerCase();
    if (!keyword) {
      this.setData({ filtered: this.data.files });
      return;
    }
    const filtered = this.data.files.filter(item =>
      (item.name || '').toLowerCase().indexOf(keyword) !== -1
    );
    this.setData({ filtered });
  },

  onSearchInput(e) {
    this.setData({ keyword: e.detail.value });
    this.applyFilter();
  },

  clearSearch() {
    if (!this.data.keyword) return;
    this.setData({ keyword: '' });
    this.applyFilter();
  },

  openBoard(e) {
    const id = e.currentTarget.dataset.id;
    if (!id) return;
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.pendingFileId = id;
    wx.switchTab({ url: '/page/component/jdraw/jdraw' });
  },

  createNewBoard() {
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.pendingFileId = '__new__';
    wx.switchTab({ url: '/page/component/jdraw/jdraw' });
  },

  onMoreTap(e) {
    const id = e.currentTarget.dataset.id;
    const name = e.currentTarget.dataset.name || '';
    if (!id) return;
    wx.showActionSheet({
      itemList: ['编辑画板', '导出', '重命名', '删除'],
      success: res => {
        if (res.tapIndex === 0) {
          this.openById(id);
        } else if (res.tapIndex === 1) {
          this.exportBoardById(id);
        } else if (res.tapIndex === 2) {
          this.showRename(id, name);
        } else if (res.tapIndex === 3) {
          this.confirmDelete(id);
        }
      }
    });
  },

  openById(id) {
    const app = getApp();
    app.globalData = app.globalData || {};
    app.globalData.pendingFileId = id;
    wx.switchTab({ url: '/page/component/jdraw/jdraw' });
  },

  showRename(id, name) {
    this.setData({
      renameVisible: true,
      renameId: id,
      renameValue: name
    });
  },

  onRenameInput(e) {
    this.setData({ renameValue: e.detail.value });
  },

  cancelRename() {
    this.setData({
      renameVisible: false,
      renameId: '',
      renameValue: ''
    });
  },

  confirmRename() {
    const result = boardStore.renameFile(this.data.renameId, this.data.renameValue);
    if (!result.ok) {
      wx.showToast({ title: result.message, icon: 'none' });
      return;
    }
    this.cancelRename();
    this.refreshFiles();
    wx.showToast({ title: '已重命名', icon: 'success' });
  },

  confirmDelete(id) {
    wx.showModal({
      title: '删除画板？',
      content: '删除后无法恢复，确定要删除该画板吗？',
      confirmText: '删除',
      confirmColor: '#EF4444',
      success: res => {
        if (!res.confirm) return;
        const result = boardStore.deleteFile(id);
        if (!result.ok) {
          wx.showToast({ title: result.message, icon: 'none' });
          return;
        }
        const app = getApp();
        app.globalData = app.globalData || {};
        if (app.globalData.currentEditingFileId === id) {
          // 删除当前编辑的文件：仅解除文件绑定，画板内容保留，下次保存生成新 ID
          app.globalData.pendingFileId = '__detach__';
          app.globalData.currentEditingFileId = '';
        }
        this.refreshFiles();
        wx.showToast({ title: '已删除', icon: 'success' });
      }
    });
  },

  exportBoardById(id) {
    if (this.data.isExportingImage) return;
    const file = boardStore.getFile(id);
    if (!file || !file.data) {
      wx.showToast({ title: '画板文件不存在', icon: 'none' });
      return;
    }
    const boardData = file.data || {};
    if (!boardData.graphObjects || boardData.graphObjects.length === 0) {
      wx.showToast({ title: '画板为空', icon: 'none' });
      return;
    }
    this.requireExportAd(() => this.doExportBoard(boardData));
  },

  requireExportAd(callback) {
    if (!this.exportImageAd) {
      wx.showToast({ title: '广告未初始化，请稍后再试', icon: 'none' });
      return;
    }
    this.exportImageAd.show((ok, message) => {
      if (!ok) {
        if (message) wx.showToast({ title: message, icon: 'none' });
        return;
      }
      if (typeof callback === 'function') callback();
    });
  },

  doExportBoard(boardData) {
    const bounds = boardData.canvasBounds || { minX: 0, maxX: 800, minY: 0, maxY: 1000 };
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
      this.renderBoardToContext(exportCtx, boardData, exportWidth, exportHeight, renderScale, tx, ty);
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

  renderBoardToContext(ctx, boardData, width, height, scale, tx, ty) {
    ctx.clearRect(0, 0, width, height);
    setFillStyleCompat(ctx, '#ffffff');
    ctx.fillRect(0, 0, width, height);
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(tx / scale, ty / scale);
    const objects = boardData.graphObjects || [];
    for (let i = 0; i < objects.length; i++) {
      this.drawExportObject(ctx, objects[i]);
    }
    ctx.restore();
  },

  drawExportObject(ctx, obj) {
    if (!obj) return;
    if (obj.type === 'path') {
      const points = obj.points || [];
      if (!points.length) return;
      const style = obj.style || {};
      setStrokeStyleCompat(ctx, style.color || '#000000');
      setLineWidthCompat(ctx, style.width || 1);
      setLineCapCompat(ctx, 'round');
      setLineJoinCompat(ctx, 'round');
      ctx.beginPath();
      ctx.moveTo(points[0].x + (obj.x || 0), points[0].y + (obj.y || 0));
      for (let j = 1; j < points.length; j++) {
        ctx.lineTo(points[j].x + (obj.x || 0), points[j].y + (obj.y || 0));
      }
      ctx.stroke();
    } else if (obj.type === 'image' && obj.src) {
      ctx.drawImage(obj.src, obj.x, obj.y, obj.w, obj.h);
    }
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

  stopPropagation() {}
});
