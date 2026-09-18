const share = require('../../../utils/share');

Page({
  onLoad() {
    share.enableShareMenu();
  },

  openAlbumSettings() {
    const showError = () => wx.showToast({
      title: '暂时无法打开设置，请稍后重试',
      icon: 'none'
    });
    if (typeof wx.openSetting !== 'function') {
      showError();
      return;
    }
    try {
      wx.openSetting({
        fail: err => {
          if (!/cancel/i.test((err && err.errMsg) || '')) showError();
        }
      });
    } catch (e) {
      showError();
    }
  },

  onShareAppMessage() {
    return share.getShareInfo();
  },

  onShareTimeline() {
    return share.getTimelineInfo();
  }
});
