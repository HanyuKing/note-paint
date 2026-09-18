const share = require('../../../utils/share');

Page({
  data: {
    versionText: '版本信息暂不可用'
  },

  onLoad() {
    share.enableShareMenu();
    if (typeof wx.getAccountInfoSync !== 'function') return;
    try {
      const account = wx.getAccountInfoSync();
      const info = (account && account.miniProgram) || {};
      const version = typeof info.version === 'string' ? info.version.trim() : '';
      const environment = { develop: '开发版', trial: '体验版' }[info.envVersion];
      const versionText = environment
        ? environment + (version ? ' · ' + version : '')
        : (version ? '版本 ' + version : '版本信息暂不可用');
      this.setData({ versionText });
    } catch (e) {
      // 无法读取时保留缺省提示，不使用虚构版本号。
    }
  },

  onShareAppMessage() {
    return share.getShareInfo();
  },

  onShareTimeline() {
    return share.getTimelineInfo();
  }
});
