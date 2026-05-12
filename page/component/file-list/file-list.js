const boardStore = require('../../../utils/boardStore');

Page({
  data: {
    files: [],
    filtered: [],
    keyword: '',
    hasFiles: false,
    renameVisible: false,
    renameId: '',
    renameValue: ''
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 1 });
    }
    this.refreshFiles();
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
      itemList: ['编辑画板', '重命名', '删除'],
      success: res => {
        if (res.tapIndex === 0) {
          this.openById(id);
        } else if (res.tapIndex === 1) {
          this.showRename(id, name);
        } else if (res.tapIndex === 2) {
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

  stopPropagation() {}
});
