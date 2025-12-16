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
    const padding = 50;

    if (x < bounds.minX) {
      bounds.minX = Math.floor(x - padding);
      needUpdate = true;
    }
    if (x > bounds.maxX) {
      bounds.maxX = Math.ceil(x + padding);
      needUpdate = true;
    }
    if (y < bounds.minY) {
      bounds.minY = Math.floor(y - padding);
      needUpdate = true;
    }
    if (y > bounds.maxY) {
      bounds.maxY = Math.ceil(y + padding);
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

    if (touches.length === 1) {
      // 单指触摸
      const touch = touches[0];

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
          // 点击空白处：取消选中 + 开启平移
          this.setData({
            activeObjectId: null,
            isDraggingObject: false,
            isPanning: true,
            lastPanPoint: { x: touch.x, y: touch.y }
          });
        }
        this.redrawCanvas();

      } else {
        // 绘画模式 ... (unchanged)
        let tinct, lineWidth;
        const currentBrushState = this.data.brushState || 'p';
        if (currentBrushState == 'p') {
          const colorList = this.data.tinctList || [];
          const colorIndex = this.data.tinctCurr || 0;
          tinct = colorList[colorIndex] || '#000000';
          lineWidth = this.data.tinctSize || 5;
        } else {
          tinct = "#ffffff";
          lineWidth = 20;
          this.context.setLineCap('round');
          this.context.setLineJoin('round');
        }

        this.context.setStrokeStyle(tinct);
        this.context.setLineWidth(lineWidth);

        const canvasPos = this.screenToCanvas(touch.x, touch.y);
        this.expandCanvasBounds(canvasPos.x, canvasPos.y);

        this.setData({
          isDrawing: true
        });

        const newPathObject = {
          id: 'path_' + Date.now(),
          type: 'path',
          x: 0, y: 0,
          points: [canvasPos],
          style: {
            color: tinct,
            width: lineWidth
          },
          itemBox: {
            minX: canvasPos.x, maxX: canvasPos.x,
            minY: canvasPos.y, maxY: canvasPos.y
          }
        };

        this.data.graphObjects.push(newPathObject);
      }

    } else if (touches.length === 2) {
      // ... (unchanged)
      const centerX = (touches[0].x + touches[1].x) / 2;
      const centerY = (touches[0].y + touches[1].y) / 2;

      this.setData({
        isDrawing: false,
        isZooming: true,
        lastTouchDistance: this.getDistance(touches[0], touches[1]),
        lastPanPoint: { x: centerX, y: centerY }
      });
    }
  },
  touchMove: function (e) {
    const touches = e.touches;

    // ... (unchanged object dragging)
    if (this.data.currentMode === 'select' && this.data.isDraggingObject && touches.length === 1 && this.data.activeObjectId) {
      const touch = touches[0];
      const dx_screen = touch.x - this.data.lastDragPoint.x;
      const dy_screen = touch.y - this.data.lastDragPoint.y;

      const dx_canvas = dx_screen / this.data.scale;
      const dy_canvas = dy_screen / this.data.scale;

      const objects = this.data.graphObjects;
      const obj = objects.find(o => o.id === this.data.activeObjectId);

      if (obj) {
        obj.x = (obj.x || 0) + dx_canvas;
        obj.y = (obj.y || 0) + dy_canvas;
        this.setData({
          lastDragPoint: { x: touch.x, y: touch.y }
        });
        this.redrawCanvas();
      }
      return;
    }

    if (this.data.isDrawing && touches.length === 1) {
      // ... (unchanged drawing)
      const touch = touches[0];
      const canvasPos = this.screenToCanvas(touch.x, touch.y);
      this.expandCanvasBounds(canvasPos.x, canvasPos.y);
      const objects = this.data.graphObjects;
      const currentObj = objects[objects.length - 1];

      if (currentObj && currentObj.type === 'path') {
        const lastPoint = currentObj.points[currentObj.points.length - 1];
        const dx = canvasPos.x - lastPoint.x;
        const dy = canvasPos.y - lastPoint.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 4) return;

        currentObj.points.push(canvasPos);
        currentObj.itemBox.minX = Math.min(currentObj.itemBox.minX, canvasPos.x);
        currentObj.itemBox.maxX = Math.max(currentObj.itemBox.maxX, canvasPos.x);
        currentObj.itemBox.minY = Math.min(currentObj.itemBox.minY, canvasPos.y);
        currentObj.itemBox.maxY = Math.max(currentObj.itemBox.maxY, canvasPos.y);

        this.bindDraw(currentObj.points);
      }

    } else if (this.data.isZooming && touches.length === 2) {
      // ... (unchanged zooming)
      const currentDistance = this.getDistance(touches[0], touches[1]);
      const scaleChange = currentDistance / this.data.lastTouchDistance;
      let newScale = this.data.scale * scaleChange;
      newScale = Math.max(0.05, newScale);

      const centerX = (touches[0].x + touches[1].x) / 2;
      const centerY = (touches[0].y + touches[1].y) / 2;

      const moveX = centerX - this.data.lastPanPoint.x;
      const moveY = centerY - this.data.lastPanPoint.y;

      let newTranslateX = centerX - (centerX - this.data.translateX) * (newScale / this.data.scale);
      let newTranslateY = centerY - (centerY - this.data.translateY) * (newScale / this.data.scale);

      newTranslateX += moveX;
      newTranslateY += moveY;

      // 性能优化：直接修改 data 而不是 setData
      this.data.scale = newScale;
      this.data.translateX = newTranslateX;
      this.data.translateY = newTranslateY;
      this.data.lastTouchDistance = currentDistance;
      this.data.lastPanPoint = { x: centerX, y: centerY };

      // 显示缩放比例 (Center Toast)
      // 仅当百分比变化时才 setData，减少通信
      const newPercent = Math.round(newScale * 100);
      if (newPercent !== this.data.scalePercent) {
        this.setData({
          scalePercent: newPercent,
          showScaleToast: true
        });
      }

      const now = Date.now();
      if (now - (this.lastRenderTime || 0) > 20) {
        this.redrawCanvas(true); // Enable LOD
        this.lastRenderTime = now;
      }

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

        this.redrawCanvas();
      }
    }
  },
  touchEnd: function (e) {
    if (this.data.longPressTimer) {
      clearTimeout(this.data.longPressTimer);
      this.data.longPressTimer = null;
    }

    // 重置手势状态
    this.setData({
      isDrawing: false,
      isPanning: false,
      isZooming: false,
      isDraggingObject: false,
      lastPanPoint: null,
      lastTouchDistance: 0,
      showScaleToast: false // 隐藏缩放提示
    });
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

  // 核心渲染逻辑 (支持渲染到不同 Context)
  renderToContext: function (ctx, width, height, scale, tx, ty, isExport) {
    // 清空画布
    ctx.clearRect(0, 0, width, height);

    // 填充白色背景
    ctx.setFillStyle('#ffffff');
    ctx.fillRect(0, 0, width, height);

    // 应用变换
    ctx.save();
    ctx.scale(scale, scale);
    ctx.translate(tx / scale, ty / scale);

    // 重绘所有对象
    let objects = this.data.graphObjects;

    // --- 视口剔除 (Viewport Culling) ---
    if (!isExport) {
      // 计算当前屏幕可见范围
      const buffer = 100;
      const vX = -tx / scale - buffer;
      const vY = -ty / scale - buffer;
      const vW = (width / scale) + (buffer * 2);
      const vH = (height / scale) + (buffer * 2);

      for (let i = 0; i < objects.length; i++) {
        const obj = objects[i];
        const box = obj.itemBox;
        const objMinX = box.minX + (obj.x || 0);
        const objMaxX = box.maxX + (obj.x || 0);
        const objMinY = box.minY + (obj.y || 0);
        const objMaxY = box.maxY + (obj.y || 0);

        if (objMinX > vX + vW || objMaxX < vX ||
          objMinY > vY + vH || objMaxY < vY) {
          continue;
        }

        this.drawObject(ctx, obj);
      }
    } else {
      // 导出模式：全量绘制
      for (let i = 0; i < objects.length; i++) {
        this.drawObject(ctx, objects[i]);
      }
    }

    ctx.restore();
    // ctx.draw() 由调用方决定是否有回调
  },

  // 重绘主画布
  redrawCanvas: function () {
    this.renderToContext(
      this.context,
      this.data.canvasWidth,
      this.data.canvasHeight,
      this.data.scale,
      this.data.translateX,
      this.data.translateY,
      false // isExport
    );
    this.context.draw(); // Call draw for the main canvas
  },

  // 抽离单个对象绘制逻辑
  drawObject: function (ctx, obj) {
    if (obj.type === 'path') {
      if (obj.points.length > 0) {
        ctx.setStrokeStyle(obj.style.color);
        ctx.setLineWidth(obj.style.width);
        ctx.setLineCap('round');
        ctx.setLineJoin('round');

        ctx.beginPath();
        ctx.moveTo(obj.points[0].x + (obj.x || 0), obj.points[0].y + (obj.y || 0));
        for (let j = 1; j < obj.points.length; j++) {
          ctx.lineTo(obj.points[j].x + (obj.x || 0), obj.points[j].y + (obj.y || 0));
        }
        ctx.stroke();
      }
    } else if (obj.type === 'image') {
      ctx.drawImage(obj.src, obj.x, obj.y, obj.w, obj.h);
    }

    // 绘制选中框 (主画布且此时不是导出时，或者导出也想绘制选中框？一般导出不画选中框)
    // 注意：这里 activeObjectId 通常只在 UI 交互中有意义
    // 如果需要在导出时隐藏选中框，可增加参数控制。这里暂保持一致。
    if (this.data.activeObjectId === obj.id) {
      ctx.setStrokeStyle('#1aad19');
      ctx.setLineWidth(2);

      let box = obj.itemBox;
      const finalX = box.minX + (obj.x || 0);
      const finalY = box.minY + (obj.y || 0);
      const finalW = box.maxX - box.minX;
      const finalH = box.maxY - box.minY;

      ctx.strokeRect(finalX - 5, finalY - 5, finalW + 10, finalH + 10);
    }
  },

  // 保存图片到相册 (离屏渲染方案)
  saveToAlbum: function () {
    const that = this;
    wx.showLoading({
      title: '正在保存...',
    });

    // 1. 计算完整内容的宽高
    const bounds = this.data.canvasBounds;
    const padding = 50;
    const fullWidth = (bounds.maxX - bounds.minX) + padding * 2;
    const fullHeight = (bounds.maxY - bounds.minY) + padding * 2;

    // 2. 设置离屏画布尺寸
    this.setData({
      exportWidth: fullWidth,
      exportHeight: fullHeight
    }, () => {
      // 3. 创建离屏画布上下文
      const exportCtx = wx.createCanvasContext('exportCanvas', that);

      // 4. 计算对齐参数 (Scale=1, Translate以左上角为原点)
      const tx = -bounds.minX + padding;
      const ty = -bounds.minY + padding; // 加上 padding 居中一点

      // 5. 渲染到离屏画布
      // 这里不调用 redrawCanvas，而是调用核心渲染方法
      that.renderToContext(
        exportCtx,
        fullWidth,
        fullHeight,
        1, // scale
        tx, ty, // translate
        true // isExport
      );

      // 6. 导出
      // 在 renderToContext 后，我们需要一次带回调的 draw 此时才能确保离屏渲染完成
      exportCtx.draw(true, () => {
        wx.canvasToTempFilePath({
          canvasId: 'exportCanvas',
          fileType: 'png',
          destWidth: fullWidth,
          destHeight: fullHeight,
          width: fullWidth,
          height: fullHeight,
          success: function (res) {
            wx.saveImageToPhotosAlbum({
              filePath: res.tempFilePath,
              success: function () {
                wx.hideLoading();
                wx.showToast({ title: '保存成功', icon: 'success' });
              },
              fail: function (err) {
                wx.hideLoading();
                // 兼容不同机型的权限拒绝报错
                if (err.errMsg.indexOf('auth') > -1 || err.errMsg.indexOf('deny') > -1) {
                  wx.showModal({
                    title: '保存失败',
                    content: '请授权保存相册，以便将作品保存到您的手机',
                    showCancel: false,
                    confirmText: '去授权',
                    success: function (res) {
                      if (res.confirm) {
                        wx.openSetting();
                      }
                    }
                  });
                } else {
                  wx.showToast({ title: '保存失败: ' + err.errMsg, icon: 'none' });
                }
              }
            });
          },
          fail: function () {
            wx.hideLoading();
            wx.showToast({ title: '导出失败', icon: 'none' });
          }
        }, that);
      });
    });
  },

  // 保存后的恢复逻辑 (不再需要，因为主画布未被修改)
  restoreAfterSave: function (originalWidth) {
    // This function is no longer needed as the main canvas state is not altered during export.
    // The main canvas will retain its current view and dimensions.
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
  },
  // 切换画笔/橡皮檫 (并自动进入绘画模式)
  switchBrush: function (e) {
    this.setData({
      currentMode: 'draw',
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

  // 显示/关闭教程
  showTutorialAgain: function () {
    this.setData({ showTutorial: true });
  },
  closeTutorial: function () {
    this.setData({ showTutorial: false });
  },

  //更改画笔颜色
  tinColorChange: function (e) {
    const index = e.currentTarget.dataset.index;
    this.setData({
      tinctCurr: index,
      brushState: 'p' // 选颜色时自动切换回画笔模式
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