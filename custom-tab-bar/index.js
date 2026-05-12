Component({
  data: {
    selected: 0,
    hidden: false,
    list: [
      {
        pagePath: '/page/component/jdraw/jdraw',
        text: '画板'
      },
      {
        pagePath: '/page/component/file-list/file-list',
        text: '文件'
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
