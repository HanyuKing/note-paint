//app.js
function isRewardedVideoPlayerError(error) {
  const msg = typeof error === 'string'
    ? error
    : (error && (error.errMsg || error.message || JSON.stringify(error))) || '';
  return /updateVideoPlayer:fail invalid videoPlayerId/i.test(msg);
}

App({
  onLaunch: function () {
    var logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

    // 自定义 tabBar 模式下，确保系统默认 tabBar 永远是隐藏的
    // 兜底处理：若之前某些 API 误触发了系统 tabBar，重启时把它清掉
    try { wx.hideTabBar({ animation: false }); } catch (e) {}

    wx.login({
      success: res => {
        // 预留登录回调
      }
    })
  },
  globalData: {
    userInfo: null,
    pendingFileId: ''
  },
  onUnhandledRejection: function (res) {
    const reason = res && res.reason;
    if (isRewardedVideoPlayerError(reason)) {
      console.warn('忽略激励视频广告 SDK 内部状态错误:', reason);
      return;
    }
    console.error('未处理的 Promise 异常:', reason);
  },
  onError: function (error) {
    if (isRewardedVideoPlayerError(error)) {
      console.warn('忽略激励视频广告 SDK 内部状态错误:', error);
      return;
    }
    console.error(error);
  }
})
