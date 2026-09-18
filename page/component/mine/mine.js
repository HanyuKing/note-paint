const share = require('../../../utils/share');

Page({
  onLoad() {
    share.enableShareMenu();
  },

  onShow() {
    if (typeof this.getTabBar === 'function' && this.getTabBar()) {
      this.getTabBar().setData({ selected: 2, hidden: false });
    }
  },

  openHelp() {
    wx.navigateTo({ url: '/page/component/help/help' });
  },

  openAbout() {
    wx.navigateTo({ url: '/page/component/about/about' });
  },

  onShareAppMessage() {
    return share.getShareInfo();
  },

  onShareTimeline() {
    return share.getTimelineInfo();
  }
});
