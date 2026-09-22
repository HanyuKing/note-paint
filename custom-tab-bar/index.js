Component({
  data: {
    selected: 0,
    hidden: false,
    list: [
      {
        pagePath: '/page/component/jdraw/jdraw',
        text: '画板',
        iconPath: '/image/tab_palette.svg',
        selectedIconPath: '/image/tab_palette_on.svg',
        fallbackIconPath: '/image/tab_palette.png',
        selectedFallbackIconPath: '/image/tab_palette_on.png',
        iconFallback: false
      },
      {
        pagePath: '/page/component/file-list/file-list',
        text: '作品',
        iconPath: '/image/tab_file.svg',
        selectedIconPath: '/image/tab_file_on.svg',
        fallbackIconPath: '/image/tab_file.png',
        selectedFallbackIconPath: '/image/tab_file_on.png',
        iconFallback: false
      },
      {
        pagePath: '/page/component/mine/mine',
        text: '我的',
        iconPath: '/image/tab_mine.svg',
        selectedIconPath: '/image/tab_mine_on.svg',
        fallbackIconPath: '/image/tab_mine.png',
        selectedFallbackIconPath: '/image/tab_mine_on.png',
        iconFallback: false
      }
    ]
  },
  methods: {
    switchTab(e) {
      const index = e.currentTarget.dataset.index;
      const item = this.data.list[index];
      if (!item) return;
      if (this.data.selected === index) return;
      wx.switchTab({ url: item.pagePath });
    },

    handleIconError(e) {
      const index = e.currentTarget.dataset.index;
      const item = index === undefined ? null : this.data.list[index];
      if (!item || item.iconFallback) return;
      this.setData({
        [`list[${index}].iconPath`]: item.fallbackIconPath,
        [`list[${index}].selectedIconPath`]: item.selectedFallbackIconPath,
        [`list[${index}].iconFallback`]: true
      });
    }
  }
});
