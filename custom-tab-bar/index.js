Component({
  data: {
    selected: 0,
    hidden: false,
    list: [
      {
        pagePath: '/page/component/jdraw/jdraw',
        text: '画板',
        iconPath: '/image/tab_palette.png',
        selectedIconPath: '/image/tab_palette_on.png'
      },
      {
        pagePath: '/page/component/file-list/file-list',
        text: '作品',
        iconPath: '/image/tab_file.png',
        selectedIconPath: '/image/tab_file_on.png'
      },
      {
        pagePath: '/page/component/mine/mine',
        text: '我的',
        iconPath: '/image/tab_mine.png',
        selectedIconPath: '/image/tab_mine_on.png'
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
    }
  }
});
