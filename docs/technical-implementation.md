# 笔记画板技术实现文档

## 1. 项目概览

本项目是一个微信小程序画板应用，使用原生小程序页面结构开发，不依赖第三方框架或后端服务。核心实现集中在 `page/component/jdraw/jdraw` 页面，基于微信 Canvas 2D 绘制 API、触摸事件和本地存储能力完成绘制、对象管理、视图变换、图片插入、导出保存和教程展示。

## 2. 技术栈

- 运行环境：微信小程序。
- 基础库版本：`2.21.0`。
- 页面结构：WXML。
- 页面样式：WXSS。
- 页面逻辑：JavaScript。
- 绘制能力：`wx.createCanvasContext`、`canvas` 组件。
- 图片选择：`wx.chooseImage`、`wx.getImageInfo`。
- 图片导出：`wx.canvasToTempFilePath`。
- 相册保存：`wx.saveImageToPhotosAlbum`。
- 本地状态：页面 `data` 和 `wx.getStorageSync` / `wx.setStorageSync`。

## 3. 目录结构

```text
.
├── app.js
├── app.json
├── app.wxss
├── page
│   └── component
│       └── jdraw
│           ├── jdraw.js
│           ├── jdraw.json
│           ├── jdraw.wxml
│           └── jdraw.wxss
├── project.config.json
├── sitemap.json
└── README.md
```

关键文件说明：

- `app.json`：声明小程序页面入口、窗口标题、相册写入权限说明。
- `app.js`：小程序生命周期入口，保留本地日志和登录示例逻辑。
- `app.wxss`：全局页面基础样式。
- `jdraw.wxml`：画板页面结构，包括工具栏、色板、滑块、主画布、导出画布、缩放提示、广告和教程弹窗。
- `jdraw.wxss`：画板页面视觉样式。
- `jdraw.js`：画板页面核心逻辑。

## 4. 应用入口

`app.json` 中只配置了一个页面：

```json
{
  "pages": [
    "page/component/jdraw/jdraw"
  ]
}
```

窗口标题为“笔记画板”。相册权限通过 `permission.scope.writePhotosAlbum.desc` 配置，用于保存作品时向用户解释授权用途。

## 5. 页面状态模型

画板页面的主要状态都存放在 `Page({ data })` 中。

### 5.1 对象数据

`graphObjects` 是当前画板的核心数据结构，用于保存所有可绘制对象。当前支持两类对象：

```js
{
  id: 'path_...',
  type: 'path',
  x: 0,
  y: 0,
  points: [{ x, y }],
  style: {
    color: '#000000',
    width: 5
  },
  itemBox: {
    minX,
    maxX,
    minY,
    maxY
  }
}
```

```js
{
  id: 'img_...',
  type: 'image',
  src: tempFilePath,
  x,
  y,
  w,
  h,
  itemBox: {
    minX: 0,
    maxX: w,
    minY: 0,
    maxY: h
  }
}
```

对象模型有几个重要设计点：

- `id` 用于对象选中和拖动。
- `type` 决定绘制方式。
- `x` / `y` 用于对象整体位移。
- `itemBox` 用于命中检测、视口剔除和导出边界计算。
- 路径对象将触摸点保存在 `points` 中，图片对象保存临时文件路径和尺寸。

### 5.2 工具状态

- `currentMode`：当前模式，取值为 `draw` 或 `select`。
- `brushState`：绘画模式下的工具，取值为 `p` 或 `c`，分别表示画笔和橡皮。
- `tinctList`：预设颜色数组。
- `tinctCurr`：当前颜色索引。
- `tinctSize`：当前画笔粗细。
- `activeObjectId`：当前选中的对象 ID。

### 5.3 视图状态

- `canvasWidth` / `canvasHeight`：当前 Canvas 组件尺寸。
- `scale`：当前缩放比例。
- `translateX` / `translateY`：当前视图平移量。
- `canvasBounds`：画布内容边界，包含 `minX`、`maxX`、`minY`、`maxY`。

### 5.4 手势状态

- `isDrawing`：是否正在绘制。
- `isPanning`：是否正在平移。
- `isZooming`：是否正在双指缩放。
- `isDraggingObject`：是否正在拖动选中对象。
- `lastTouchDistance`：上一次双指距离。
- `lastPanPoint`：上一次平移或双指中心点。
- `lastDragPoint`：上一次对象拖动触点。

### 5.5 UI 状态

- `showTutorial`：是否展示使用说明弹窗。
- `showScaleToast`：是否展示缩放百分比。
- `scalePercent`：缩放百分比文本。
- `showAd`：是否展示底部广告位。
- `exportWidth` / `exportHeight`：离屏导出 Canvas 尺寸。

## 6. 坐标系统

项目同时存在屏幕坐标和画布坐标。

### 6.1 屏幕坐标转画布坐标

触摸事件提供的是屏幕坐标。绘制对象需要保存到画布坐标系，因此通过 `screenToCanvas` 做反向变换：

```js
canvasX = (screenX - translateX) / scale
canvasY = (screenY - translateY) / scale
```

该转换用于绘制起点、路径点、图片插入位置、对象命中检测等场景。

### 6.2 画布坐标转屏幕坐标

`canvasToScreen` 提供正向变换：

```js
screenX = canvasX * scale + translateX
screenY = canvasY * scale + translateY
```

当前代码中该函数主要作为通用工具保留。

## 7. 绘制流程

### 7.1 初始化

页面 `onReady` 中通过 `wx.createCanvasContext('palette')` 创建主画布上下文，并读取系统窗口宽高，后续用于图片居中插入。

同时会调用 `checkFirstTimeUser` 判断是否需要展示首次使用教程。

### 7.2 开始绘制

单指按下时，如果当前模式为 `draw`：

1. 根据 `brushState` 确定颜色和线宽。
2. 将触摸点从屏幕坐标转换为画布坐标。
3. 调用 `expandCanvasBounds` 检查是否需要扩展画布边界。
4. 创建新的 `path` 对象并放入 `graphObjects`。
5. 设置 `isDrawing = true`。

橡皮模式当前使用白色线条和固定较大线宽实现覆盖擦除。

### 7.3 绘制移动

触摸移动时，如果 `isDrawing` 为真：

1. 将当前触点转换为画布坐标。
2. 扩展画布边界。
3. 获取 `graphObjects` 中最后一个路径对象。
4. 与上一个点比较，如果距离过小则跳过，减少点数量。
5. 追加新点并更新路径包围盒。
6. 调用 `bindDraw` 增量绘制当前路径。

### 7.4 增量绘制

`bindDraw` 会对主画布上下文应用当前缩放和平移变换，然后按路径点执行 `moveTo` 和 `lineTo`，最后调用 `context.draw(true)` 追加绘制。

增量绘制可以降低绘制时每帧重绘全部对象的成本，但在缩放、平移、撤销、清空、对象移动等场景仍会走完整重绘。

## 8. 对象选择与拖动

选择模式下单指按下时，系统会将触点转换为画布坐标，然后倒序遍历 `graphObjects`，优先命中后创建的上层对象。

命中判断基于对象包围盒：

```js
canvasX >= box.minX + obj.x &&
canvasX <= box.maxX + obj.x &&
canvasY >= box.minY + obj.y &&
canvasY <= box.maxY + obj.y
```

命中后记录 `activeObjectId`、`isDraggingObject` 和 `lastDragPoint`。拖动时将屏幕位移除以当前 `scale`，换算成画布位移后累加到对象 `x` / `y` 上，然后调用 `redrawCanvas` 重绘。

如果在选择模式下点击空白区域，则清空选中对象并进入平移状态。

## 9. 缩放和平移

### 9.1 双指缩放

当触摸点数量为 2 时，系统进入缩放状态：

1. 记录两指距离 `lastTouchDistance`。
2. 记录两指中心点 `lastPanPoint`。
3. 后续移动时用当前距离除以上一次距离得到缩放变化量。
4. 更新 `scale`，最小值限制为 `0.05`。
5. 根据双指中心点修正 `translateX` 和 `translateY`，使缩放围绕手势中心发生。
6. 更新缩放百分比提示。
7. 按时间间隔节流调用 `redrawCanvas`。

### 9.2 单指平移

当前代码中，单指平移主要发生在选择模式点击空白区域后。移动时计算屏幕位移并累加到 `translateX` / `translateY`，然后完整重绘画布。

## 10. 画布边界扩展

`canvasBounds` 维护当前内容边界，初始范围为 `0,0,800,1000`。

当绘制点或图片超出边界时，`expandCanvasBounds` 会按 50px 留白扩展边界，并同步更新：

- `canvasBounds`
- `canvasWidth`
- `canvasHeight`

该设计让画布可以随着内容自然增大，也为导出完整内容提供边界依据。

需要注意的是，当前主画布尺寸与内容边界关联较强，极大画布可能带来 Canvas 内存和渲染压力。

## 11. 渲染架构

### 11.1 统一渲染入口

`renderToContext(ctx, width, height, scale, tx, ty, isExport)` 是核心渲染函数，用于主画布重绘和离屏导出。

主要步骤：

1. 清空目标画布。
2. 填充白色背景。
3. 应用缩放和平移变换。
4. 遍历 `graphObjects`。
5. 调用 `drawObject` 绘制单个对象。
6. 恢复上下文状态。

### 11.2 主画布重绘

`redrawCanvas` 使用当前页面状态调用 `renderToContext`，然后执行 `this.context.draw()`。

会触发完整重绘的场景包括：

- 切换选择模式。
- 拖动对象。
- 缩放和平移。
- 撤销。
- 清空。
- 插入图片。
- 重置视图。

### 11.3 视口剔除

非导出模式下，`renderToContext` 会计算当前视口在画布坐标系中的可见范围，并给范围增加 100px 缓冲区。完全落在视口外的对象会跳过绘制。

该优化能减少大量对象时的主画布绘制成本。导出模式下不会剔除对象，会绘制全部内容。

### 11.4 单对象绘制

`drawObject` 根据对象类型分支：

- `path`：设置颜色、线宽、圆角端点、圆角连接，然后按点连线。
- `image`：调用 `drawImage` 绘制图片。

如果对象 ID 等于 `activeObjectId`，会绘制绿色选中框。

## 12. 图片插入

`chooseImage` 使用小程序图片选择 API：

1. 调用 `wx.chooseImage`，限制 `count: 1`，来源包括相册和相机。
2. 通过 `wx.getImageInfo` 获取原图宽高。
3. 将图片显示宽度固定为 200px，高度按比例计算。
4. 读取屏幕中心点，并转换为画布坐标。
5. 创建 `image` 对象并加入 `graphObjects`。
6. 调用 `expandCanvasBounds` 扩展边界。
7. 调用 `redrawCanvas` 刷新画布。

当前图片对象支持插入、显示、选择和拖动，不支持缩放、旋转、裁剪或删除单个图片。

## 13. 导出保存

保存使用离屏 Canvas，而不是直接改变主画布。

### 13.1 导出尺寸计算

系统根据 `canvasBounds` 计算完整内容范围，并增加 50px padding：

```js
fullWidth = bounds.maxX - bounds.minX + padding * 2
fullHeight = bounds.maxY - bounds.minY + padding * 2
```

然后设置导出 Canvas 的 `exportWidth` 和 `exportHeight`。

### 13.2 离屏绘制

保存时创建 `exportCanvas` 对应的 Canvas 上下文，调用 `renderToContext`：

- `scale = 1`
- `tx = -bounds.minX + padding`
- `ty = -bounds.minY + padding`
- `isExport = true`

这样可以将完整内容平移到导出图片可见区域内。

### 13.3 生成图片并保存

离屏 Canvas 绘制完成后：

1. 调用 `wx.canvasToTempFilePath` 生成 PNG 临时文件。
2. 调用 `wx.saveImageToPhotosAlbum` 保存到相册。
3. 成功后显示成功提示。
4. 失败时根据错误信息判断是否为权限问题。
5. 权限失败时展示弹窗，引导用户打开设置页授权。

## 14. 教程与本地存储

首次使用教程通过本地存储标记控制。

流程：

1. 页面 ready 后调用 `checkFirstTimeUser`。
2. 读取 `hasUsedNotePaint`。
3. 如果不存在，则延迟展示教程弹窗。
4. 用户关闭教程后写入 `hasUsedNotePaint = true`。

当前代码中 `showTutorialAgain` 和 `closeTutorial` 存在重复定义，后面的定义会覆盖前面的定义。被覆盖后的 `closeTutorial` 只关闭弹窗，不再写入首次使用标记。该问题可能导致首次使用弹窗状态无法按预期持久化，建议后续合并重复函数。

## 15. 广告实现

页面底部通过 `ad-custom` 组件集成原生模板广告。

相关逻辑：

- `showAd` 控制广告容器显示。
- `adLoad` 记录加载成功日志。
- `adError` 记录加载失败日志。
- `adClose` 将 `showAd` 置为 `false`。

广告容器使用固定定位，并为安全区域底部留出 padding。

## 16. 性能设计

当前实现包含以下性能考虑：

- 绘制过程中对相邻点距离做过滤，减少路径点数量。
- 绘制中采用增量追加绘制，避免每次移动都全量重绘。
- 双指缩放时直接修改部分 `data` 字段，减少频繁 `setData` 的通信成本。
- 缩放重绘按时间间隔节流，约 20ms 一次。
- 主画布完整重绘时使用视口剔除，跳过不可见对象。
- 导出模式独立走全量绘制，保证保存图片完整。

潜在风险：

- `graphObjects` 长期累积后会增加内存和重绘压力。
- 动态增大 Canvas 尺寸可能在低端设备上触发性能问题。
- 图片使用临时文件路径，长期持久化草稿时需要额外处理文件保存。
- 频繁直接修改 `this.data` 虽可提升性能，但需要注意与视图层状态同步。

## 17. 已知实现注意点

- `showTutorialAgain` 和 `closeTutorial` 重复定义，后定义覆盖前定义。
- 橡皮不是对象级擦除，而是白色路径覆盖。
- `drawClear` 中仍保留 `points: []` 兼容字段，但当前核心数据已切换到 `graphObjects`。
- `restoreAfterSave` 已不再需要，函数体仅保留说明。
- `drawObject` 绘制选中框时没有区分主画布和导出画布，如导出前存在选中对象，导出图可能包含绿色选中框。
- `redrawCanvas` 目前没有使用其调用处传入的 LOD 参数，`touchMove` 中的 `redrawCanvas(true)` 实际不会改变渲染策略。

## 18. 可扩展方向

### 18.1 草稿持久化

可以将 `graphObjects`、`canvasBounds`、`scale` 和 `translate` 等状态序列化到本地存储。图片对象需要先将临时文件保存为本地持久文件路径。

### 18.2 对象编辑能力

在现有 `activeObjectId` 基础上，可以继续扩展：

- 删除选中对象。
- 调整图片大小。
- 路径或图片旋转。
- 对象层级上移下移。
- 多选对象。

### 18.3 历史栈

当前撤销通过 `graphObjects.pop()` 实现。若要支持更复杂的撤销和重做，可以引入操作历史栈：

- `addPath`
- `addImage`
- `moveObject`
- `deleteObject`
- `clearCanvas`

每类操作定义正向和反向变更，便于精细撤销与重做。

### 18.4 真实橡皮

可选方案包括：

- 路径切割：根据橡皮轨迹与路径相交情况拆分路径。
- 图层合成：使用 Canvas 合成模式擦除像素。
- 对象级删除：橡皮命中某个对象后删除对象。

不同方案在体验、性能和实现复杂度上差异较大，应结合产品目标选择。

## 19. 开发与调试建议

- 使用微信开发者工具打开项目根目录。
- 重点调试页面为 `page/component/jdraw/jdraw`。
- 在真机上验证相册保存权限、相机/相册选择、广告展示和多指手势。
- 大画布、长路径、多图片场景需要真机性能验证。
- 修改导出逻辑后，应验证当前视口、偏移内容、插入图片和超出初始边界的绘制内容是否都能完整保存。
