//app.js
App({
  onLaunch: function () {
    var logs = wx.getStorageSync('logs') || []
    logs.unshift(Date.now())
    wx.setStorageSync('logs', logs)

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
