//app.js
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
  }
})
