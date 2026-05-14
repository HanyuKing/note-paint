const DEFAULT_SHARE_TITLE = '笔记画板';
const DEFAULT_SHARE_PATH = '/page/component/jdraw/jdraw';

function enableShareMenu() {
  if (typeof wx === 'undefined' || typeof wx.showShareMenu !== 'function') return;
  wx.showShareMenu({
    withShareTicket: false,
    menus: ['shareAppMessage', 'shareTimeline']
  });
}

function getShareInfo(options) {
  const opts = options || {};
  return {
    title: opts.title || DEFAULT_SHARE_TITLE,
    path: opts.path || DEFAULT_SHARE_PATH
  };
}

function getTimelineInfo(options) {
  const opts = options || {};
  return {
    title: opts.title || DEFAULT_SHARE_TITLE
  };
}

module.exports = {
  enableShareMenu,
  getShareInfo,
  getTimelineInfo
};
