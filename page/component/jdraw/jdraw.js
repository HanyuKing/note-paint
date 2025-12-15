Page({
  data: {
    // OLD: points: [],
    graphObjects: [], // 新的数据核心：存储所有对象(Path, Image, etc)
    currentMode: 'draw', // 'draw' | 'select'
    activeObjectId: null, // 当前选中的对象ID

    brushState: 'p', //'p'-画笔；'c'-橡皮檫
    tinctList: ['#000000', '#362c23', '#715e4f', '#643d5c', '#677e3a', '#953c38', '#314d59', '#a7b47f', '#c58d8e', '#658e9f', '#229daf', '#7d790e', '#ebd669', '#2a1706', '#623919', '#ba8559', '#a33a65', '#fcac7b', '#fbe8c5', '#414141', '#828282', '#aaaaaa', '#dbdbdb', '#f7f7f7', '#ffcc59', '#cbcc57', '#e2513c', '#69b4d3', '#c72267', '#8dae21', '#1a386a', '#1f76bb', '#2fb7f5', '#a070bc', '#fb9e3f', '#ffd778'],
    tinctCurr: 0, //当前画笔颜色
    tinctSize: 5, //画笔尺寸

    // 画布变换相关
    canvasWidth: 800, //画布初始宽度
    canvasHeight: 1000, //画布初始高度
    scale: 1, //缩放比例
    translateX: 0, //X方向平移
    translateY: 0, //Y方向平移

    // 手势相关
    isDrawing: false, //是否正在绘画
    isPanning: false, //是否正在平移
    isZooming: false, //是否正在缩放
    longPressTimer: null, //长按定时器
    lastTouchDistance: 0, //上次双指距离
    lastPanPoint: null, //上次平移点

    // 画布边界（动态扩展）
    canvasBounds: {
      minX: 0,
      maxX: 800,
      minY: 0,
      maxY: 1000
    },

    // 使用说明弹窗
    showTutorial: false
  },
  onReady: function () {
    this.context = wx.createCanvasContext('palette');
    // 获取系统信息
    const systemInfo = wx.getSystemInfoSync();
    this.setData({
      screenWidth: systemInfo.windowWidth,
      screenHeight: systemInfo.windowHeight
    });

    // 检查是否第一次使用
    this.checkFirstTimeUser();
  },

  // 检查是否第一次使用
  checkFirstTimeUser: function () {
    try {
      const hasUsedBefore = wx.getStorageSync('hasUsedNotePaint');
      if (!hasUsedBefore) {
        // 第一次使用，显示使用说明
        setTimeout(() => {
          this.setData({
            showTutorial: true
          });
        }, 500);
      }
    } catch (e) {
      console.error('检查首次使用状态失败:', e);
    }
  },

  // 关闭使用说明弹窗
  closeTutorial: function () {
    this.setData({
      showTutorial: false
    });
    // 标记已使用过
    try {
      wx.setStorageSync('hasUsedNotePaint', true);
    } catch (e) {
      console.error('保存使用状态失败:', e);
    }
  },

  // 重新显示使用说明
  showTutorialAgain: function () {
    this.setData({
      showTutorial: true
    });
  },

  // 坐标转换：屏幕坐标转画布坐标
  screenToCanvas: function (screenX, screenY) {
    const canvasX = (screenX - this.data.translateX) / this.data.scale;
    const canvasY = (screenY - this.data.translateY) / this.data.scale;
    return { x: canvasX, y: canvasY };
  },

  // 画布坐标转屏幕坐标
  canvasToScreen: function (canvasX, canvasY) {
    const screenX = canvasX * this.data.scale + this.data.translateX;
    const screenY = canvasY * this.data.scale + this.data.translateY;
    return { x: screenX, y: screenY };
  },

  // 计算两点间距离
  getDistance: function (touch1, touch2) {
    const dx = touch1.x - touch2.x;
    const dy = touch1.y - touch2.y;
    return Math.sqrt(dx * dx + dy * dy);
  },

  // 扩展画布边界
  expandCanvasBounds: function (x, y) {
    let bounds = this.data.canvasBounds;
    let needUpdate = false;
    const padding = 200;

    if (x < bounds.minX) {
      bounds.minX = x - padding;
      needUpdate = true;
    }
    if (x > bounds.maxX) {
      bounds.maxX = x + padding;
      needUpdate = true;
    }
    if (y < bounds.minY) {
      bounds.minY = y - padding;
      needUpdate = true;
    }
    if (y > bounds.maxY) {
      bounds.maxY = y + padding;
      needUpdate = true;
    }

    if (needUpdate) {
      this.setData({
        canvasBounds: bounds,
        canvasWidth: bounds.maxX - bounds.minX,
        canvasHeight: bounds.maxY - bounds.minY
      });
    }
  },
  touchstart: function (e) {
    const touches = e.touches;

    // 清理之前的长按定时器
    if (this.data.longPressTimer) {
      clearTimeout(this.data.longPressTimer);
    }

    if (touches.length === 1) {
      // 单指触摸
      const touch = touches[0];

      // 设置长按定时器（500ms）
      this.data.longPressTimer = setTimeout(() => {
        this.setData({
          isPanning: true,
          isDrawing: false,
          lastPanPoint: { x: touch.x, y: touch.y }
        });
        wx.vibrateShort(); // 震动反馈
      }, 500);

      // 根据模式判断行为
      if (this.data.currentMode === 'select') {
        const canvasPos = this.screenToCanvas(touch.x, touch.y);
        // 倒序遍历（优先选中上层）
        let found = false;
        const objects = this.data.graphObjects;
        for (let i = objects.length - 1; i >= 0; i--) {
          const obj = objects[i];
          const box = obj.itemBox;
          // 简单的矩形碰撞检测
          // 注意：box 存储的是绝对坐标，不需要加 obj.x/y，因为我们在 move 时会更新 box
          if (canvasPos.x >= box.minX + (obj.x || 0) && canvasPos.x <= box.maxX + (obj.x || 0) &&
            canvasPos.y >= box.minY + (obj.y || 0) && canvasPos.y <= box.maxY + (obj.y || 0)) {

            this.setData({
              activeObjectId: obj.id,
              isDraggingObject: true,
              lastDragPoint: { x: touch.x, y: touch.y }
            });
            found = true;
            break;
          }
        }

        if (!found) {
          // 点击空白处，取消选中
          this.setData({
            activeObjectId: null,
            isDraggingObject: false
            // 未来可以在这里触发框选或平移
          });
        }
        this.redrawCanvas();

      } else {
        // 绘画模式
        let tinct, lineWidth;
        if (this.data.brushState == 'p') {
          tinct = this.data.tinctList[this.data.tinctCurr];
          lineWidth = this.data.tinctSize;
        } else {
          tinct = "#ffffff";
          lineWidth = 20;
          this.context.setLineCap('round');
          this.context.setLineJoin('round');
        }

        this.context.setStrokeStyle(tinct);
        this.context.setLineWidth(lineWidth);

        // 转换坐标
        const canvasPos = this.screenToCanvas(touch.x, touch.y);

        // 扩展画布边界
        this.expandCanvasBounds(canvasPos.x, canvasPos.y);

        this.setData({
          isDrawing: true
        });

        // 创建新的 Path 对象
        const newPathObject = {
          id: 'path_' + Date.now(),
          type: 'path',
          x: 0, y: 0, // 初始位移为0
          points: [canvasPos],
          style: {
            color: tinct,
            width: lineWidth
          },
          // 初始包围盒
          itemBox: {
            minX: canvasPos.x, maxX: canvasPos.x,
            minY: canvasPos.y, maxY: canvasPos.y
          }
        };

        this.data.graphObjects.push(newPathObject);
      }

    } else if (touches.length === 2) {
      // 双指触摸 - 缩放模式
      this.setData({
        isDrawing: false,
        isPanning: false,
        isZooming: true,
        lastTouchDistance: this.getDistance(touches[0], touches[1])
      });

      // 清理长按定时器
      if (this.data.longPressTimer) {
        clearTimeout(this.data.longPressTimer);
        this.data.longPressTimer = null;
      }
    }
  },
  touchMove: function (e) {
    const touches = e.touches;

    // Object Dragging (Select Mode)
    if (this.data.currentMode === 'select' && this.data.isDraggingObject && touches.length === 1 && this.data.activeObjectId) {
      const touch = touches[0];
      // 计算屏幕位移
      const dx_screen = touch.x - this.data.lastDragPoint.x;
      const dy_screen = touch.y - this.data.lastDragPoint.y;

      // 转换为画布位移
      const dx_canvas = dx_screen / this.data.scale;
      const dy_canvas = dy_screen / this.data.scale;

      // 更新当前对象
      const objects = this.data.graphObjects;
      const obj = objects.find(o => o.id === this.data.activeObjectId);

      if (obj) {
        // 更新位移
        obj.x = (obj.x || 0) + dx_canvas;
        obj.y = (obj.y || 0) + dy_canvas;

        // 同步更新包围盒 (ItemBox)
        // 注意：itemBox 存储的是原始坐标，obj.x/y 是位移，所以这里不需要更新 itemBox
        // itemBox 应该只反映对象本身的尺寸，位移通过 obj.x/y 统一管理
        // obj.itemBox.minX += dx_canvas;
        // obj.itemBox.maxX += dx_canvas;
        // obj.itemBox.minY += dy_canvas;
        // obj.itemBox.maxY += dy_canvas;

        this.setData({
          lastDragPoint: { x: touch.x, y: touch.y }
        });
        this.redrawCanvas();
      }
      return;
    }

    if (this.data.isDrawing && touches.length === 1) {
      // 绘画模式
      const touch = touches[0];
      const canvasPos = this.screenToCanvas(touch.x, touch.y);

      // 扩展画布边界
      this.expandCanvasBounds(canvasPos.x, canvasPos.y);

      const objects = this.data.graphObjects;
      const currentObj = objects[objects.length - 1]; // 当前正在画的对象

      if (currentObj && currentObj.type === 'path') {
        currentObj.points.push(canvasPos);

        // 更新包围盒
        currentObj.itemBox.minX = Math.min(currentObj.itemBox.minX, canvasPos.x);
        currentObj.itemBox.maxX = Math.max(currentObj.itemBox.maxX, canvasPos.x);
        currentObj.itemBox.minY = Math.min(currentObj.itemBox.minY, canvasPos.y);
        currentObj.itemBox.maxY = Math.max(currentObj.itemBox.maxY, canvasPos.y);

        this.bindDraw(currentObj.points);
      }


    } else if (this.data.isZooming && touches.length === 2) {
      // 缩放模式
      const currentDistance = this.getDistance(touches[0], touches[1]);
      const scaleChange = currentDistance / this.data.lastTouchDistance;

      // 限制缩放范围 - 最小0.1倍，最大无限制
      let newScale = this.data.scale * scaleChange;
      newScale = Math.max(0.05, newScale); // 只限制最小缩放，支持无限放大

      // 计算缩放中心点
      const centerX = (touches[0].x + touches[1].x) / 2;
      const centerY = (touches[0].y + touches[1].y) / 2;

      // 调整平移量以保持缩放中心点不变
      const newTranslateX = centerX - (centerX - this.data.translateX) * (newScale / this.data.scale);
      const newTranslateY = centerY - (centerY - this.data.translateY) * (newScale / this.data.scale);

      this.setData({
        scale: newScale,
        translateX: newTranslateX,
        translateY: newTranslateY,
        lastTouchDistance: currentDistance
      });

      // 重绘画布
      this.redrawCanvas();

    } else if (this.data.isPanning && touches.length === 1) {
      // 平移模式
      const touch = touches[0];
      if (this.data.lastPanPoint) {
        const deltaX = touch.x - this.data.lastPanPoint.x;
        const deltaY = touch.y - this.data.lastPanPoint.y;

        this.setData({
          translateX: this.data.translateX + deltaX,
          translateY: this.data.translateY + deltaY,
          lastPanPoint: { x: touch.x, y: touch.y }
        });

        // 重绘画布
        this.redrawCanvas();
      }
    }

    // 如果有移动，清理长按定时器
    if (this.data.longPressTimer) {
      clearTimeout(this.data.longPressTimer);
      this.data.longPressTimer = null;
    }
  },
  touchEnd: function (e) {
    // 清理长按定时器
    if (this.data.longPressTimer) {
      clearTimeout(this.data.longPressTimer);
      this.data.longPressTimer = null;
    }

    // 重置手势状态
    this.setData({
      isDrawing: false,
      isPanning: false,
      isZooming: false,
      lastPanPoint: null,
      lastTouchDistance: 0
    });

    // console.log(this.data.points);
  },
  //绘制单条线
  bindDraw: function (point) {
    if (point.length < 1) return;

    this.context.save();
    this.context.scale(this.data.scale, this.data.scale);
    this.context.translate(this.data.translateX / this.data.scale, this.data.translateY / this.data.scale);

    this.context.moveTo(point[0].x, point[0].y);
    for (var i = 1; i < point.length; i++) {
      this.context.lineTo(point[i].x, point[i].y);
    }
    this.context.stroke();

    this.context.restore();
    this.context.draw(true);
  },

  //重绘整个画布
  redrawCanvas: function () {
    // 清空画布
    this.context.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);

    // 应用变换
    this.context.save();
    this.context.scale(this.data.scale, this.data.scale);
    this.context.translate(this.data.translateX / this.data.scale, this.data.translateY / this.data.scale);

    // 重绘所有对象
    let objects = this.data.graphObjects;
    for (let i = 0; i < objects.length; i++) {
      const obj = objects[i];

      if (obj.type === 'path') {
        // 绘制路径
        if (obj.points.length > 0) {
          this.context.setStrokeStyle(obj.style.color);
          this.context.setLineWidth(obj.style.width);
          this.context.setLineCap('round'); // 统一设置
          this.context.setLineJoin('round');

          this.context.beginPath();
          this.context.moveTo(obj.points[0].x + (obj.x || 0), obj.points[0].y + (obj.y || 0));
          for (let j = 1; j < obj.points.length; j++) {
            this.context.lineTo(obj.points[j].x + (obj.x || 0), obj.points[j].y + (obj.y || 0));
          }
          this.context.stroke();
        }
      } else if (obj.type === 'image') {
        // 绘制图片
        this.context.drawImage(obj.src, obj.x, obj.y, obj.w, obj.h);
      }

      // 绘制选中框 (如果被选中)
      if (this.data.activeObjectId === obj.id) {
        this.context.setStrokeStyle('#1aad19'); // 微信绿
        this.context.setLineWidth(2);
        // 画个虚线框
        // 小程序 canvas v1 context setLineDash 需要查文档，暂画实线

        let box = obj.itemBox;
        // 渲染选中框时，统一加上对象的当前位移/位置
        // Image: box={0,w..}, offset=x. Total = x..x+w.
        // Path: box={createX..}, offset=dx. Total = createX+dx..
        const finalX = box.minX + (obj.x || 0);
        const finalY = box.minY + (obj.y || 0);
        const finalW = box.maxX - box.minX;
        const finalH = box.maxY - box.minY;

        this.context.strokeRect(finalX - 5, finalY - 5, finalW + 10, finalH + 10);

        // 画控制点 (可选)
      }
    }

    this.context.restore();
    this.context.draw();
  },
  //切换成画笔/橡皮檫
  switchBrush: function (e) {
    this.setData({
      brushState: e.currentTarget.dataset.state
    });
  },

  // 切换模式
  switchMode: function (e) {
    const mode = e.currentTarget.dataset.mode;
    this.setData({
      currentMode: mode,
      activeObjectId: null // 切换模式时取消选中
    });
    this.redrawCanvas();
  },

  // 选择图片
  chooseImage: function () {
    const that = this;
    wx.chooseImage({
      count: 1,
      sourceType: ['album', 'camera'],
      success: (res) => {
        const tempFilePath = res.tempFilePaths[0];
        wx.getImageInfo({
          src: tempFilePath,
          success: (info) => {
            // 计算显示尺寸，默认限制宽度 200
            const ratio = info.width / info.height;
            const w = 200;
            const h = 200 / ratio;

            // 放在屏幕中心 (转画布坐标)
            const cx = that.data.screenWidth / 2;
            const cy = that.data.screenHeight / 2;
            const canvasPos = that.screenToCanvas(cx, cy);

            const newImg = {
              id: 'img_' + Date.now(),
              type: 'image',
              src: tempFilePath,
              x: canvasPos.x - w / 2,
              y: canvasPos.y - h / 2,
              w: w,
              h: h,
              // 包围盒
              itemBox: {
                minX: 0,
                maxX: w,
                minY: 0,
                maxY: h
              }
            };

            that.data.graphObjects.push(newImg);
            // 扩展边界以包含图片
            // 注意：expandCanvasBounds 需要绝对坐标
            that.expandCanvasBounds(newImg.x, newImg.y);
            that.expandCanvasBounds(newImg.x + w, newImg.y + h);

            that.redrawCanvas();
          }
        })
      }
    })
  },
  //绘制回退
  drawBack: function () {
    if (this.data.graphObjects.length == 0) return false;
    this.data.graphObjects.pop();
    this.redrawCanvas();
  },
  //清空画布
  drawClear: function () {
    this.context.clearRect(0, 0, this.data.canvasWidth, this.data.canvasHeight);
    this.context.draw();
    this.setData({
      graphObjects: [], // Clear objects
      points: [], // Clear legacy (if any)
      // 重置画布边界
      canvasBounds: {
        minX: 0,
        maxX: 800,
        minY: 0,
        maxY: 1000
      },
      canvasWidth: 800,
      canvasHeight: 1000,
      // 重置视图变换
      scale: 1,
      translateX: 0,
      translateY: 0
    });
    // console.log(this.data.points);
  },

  // 保存图片到相册
  saveToAlbum: function () {
    const that = this;
    wx.showLoading({
      title: '正在保存...',
    });

    // 使用canvasToTempFilePath导出图片
    wx.canvasToTempFilePath({
      canvasId: 'palette',
      success: function (res) {
        // 保存到相册
        wx.saveImageToPhotosAlbum({
          filePath: res.tempFilePath,
          success: function () {
            wx.hideLoading();
            wx.showToast({
              title: '保存成功',
              icon: 'success',
              duration: 2000
            });
          },
          fail: function (err) {
            wx.hideLoading();
            if (err.errMsg === 'saveImageToPhotosAlbum:fail auth deny') {
              wx.showModal({
                title: '提示',
                content: '需要您授权保存相册',
                showCancel: false,
                confirmText: '去设置',
                success: function () {
                  wx.openSetting();
                }
              });
            } else {
              wx.showToast({
                title: '保存失败',
                icon: 'none'
              });
            }
          }
        });
      },
      fail: function (err) {
        wx.hideLoading();
        wx.showToast({
          title: '导出失败',
          icon: 'none'
        });
        console.error('导出图片失败:', err);
      }
    }, that);
  },
  //更改画笔颜色
  tinColorChange: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      tinctCurr: index
    });
  },
  //画笔大小
  tinSizechange: function (e) {
    this.setData({
      tinctSize: e.detail.value
    });
    // console.log(this.data.tinctSize);
  },

  // 重置视图
  resetView: function () {
    this.setData({
      scale: 1,
      translateX: 0,
      translateY: 0
    });
    this.redrawCanvas();
  },

  // 获取当前缩放比例百分比
  getScalePercent: function () {
    return Math.round(this.data.scale * 100);
  }
})