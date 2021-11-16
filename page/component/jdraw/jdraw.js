Page({
  data: {
    points: [],
    brushState: 'p', //'p'-画笔；'c'-橡皮檫
    tinctList: ['#000000', '#362c23', '#715e4f', '#643d5c', '#677e3a', '#953c38', '#314d59', '#a7b47f', '#c58d8e', '#658e9f', '#229daf', '#7d790e', '#ebd669', '#2a1706', '#623919', '#ba8559', '#a33a65', '#fcac7b', '#fbe8c5', '#414141', '#828282', '#aaaaaa', '#dbdbdb', '#f7f7f7', '#ffcc59', '#cbcc57', '#e2513c', '#69b4d3', '#c72267', '#8dae21', '#1a386a', '#1f76bb', '#2fb7f5', '#a070bc', '#fb9e3f', '#ffd778'],
    tinctCurr: 0, //当前画笔颜色
    tinctSize: 5 //画笔尺寸
  },
  onReady: function() {
    this.context = wx.createCanvasContext('palette');
  },
  touchstart: function() {
    let tinct, lineWidth;
    if (this.data.brushState == 'p') {
      tinct = this.data.tinctList[this.data.tinctCurr];
      lineWidth = this.data.tinctSize;
    } else {
      tinct = "#ffffff";
      lineWidth = 20;
      this.context.setLineCap('round') ;//设置线条端点的样式
      this.context.setLineJoin('round') ;//设置两线相交处的样式
    }

    this.context.setStrokeStyle(tinct); //设置描边颜色
    this.context.setLineWidth(lineWidth); //设置线条宽度
    // this.context.beginPath();
    this.data.points.push({
      point: [],
      tinct: tinct,
      lineWidth: lineWidth
    });
  },
  touchMove: function(e) {
    let pos = e.touches[0],
      da = this.data,
      po = da.points[da.points.length - 1].point;
    po.push({
      x: pos.x,
      y: pos.y
    });
    this.bindDraw(po);
  },
  touchEnd: function(e) {
    console.log(this.data.points);
  },
  //绘制
  bindDraw: function(point) {
    this.context.moveTo(point[0].x, point[0].y);
    for (var i = 1; i < point.length; i++) {
      this.context.lineTo(point[i].x, point[i].y);
    }
    this.context.stroke();
    this.context.draw(true);
  },
  //切换成画笔/橡皮檫
  switchBrush: function(e) {
    this.setData({
      brushState: e.currentTarget.dataset.state
    });
  },
  //绘制回退
  drawBack: function() {
    if (this.data.points.length == 0) return false;
    this.context.clearRect(0, 0, 400, 500);
    this.context.draw();
    this.data.points.pop();
    console.log(this.data.points);
    let po = this.data.points;
    for (let i = 0; i < po.length; i++) {
      this.context.setStrokeStyle(po[i].tinct); //设置描边颜色
      this.context.setLineWidth(po[i].lineWidth); //设置线条宽度
      // this.context.beginPath();
      this.bindDraw(po[i].point);
    }
  },
  //清空画布
  drawClear:function(){
    this.context.clearRect(0, 0, 400, 500);
    this.context.draw();
    this.setData({points:[]});
    console.log(this.data.points);
  },
  //更改画笔颜色
  tinColorChange: function(e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      tinctCurr: index
    });
  },
  //画笔大小
  tinSizechange: function(e) {
    this.setData({
      tinctSize: e.detail.value
    });
    console.log(this.data.tinctSize);
  }
})