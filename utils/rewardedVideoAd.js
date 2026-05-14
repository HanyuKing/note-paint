const SAVE_FILE_AD_UNIT_ID = 'adunit-fbfb5a29542b3196';
const EXPORT_IMAGE_AD_UNIT_ID = 'adunit-e7ab73bbb204f635';

function createRewardedVideoAd(adUnitId, options) {
  const opts = options || {};
  let ad = null;
  let pendingCallback = null;
  let closeHandler = null;
  let errorHandler = null;

  function finish(ok, message) {
    const callback = pendingCallback;
    pendingCallback = null;
    if (typeof callback === 'function') callback(ok, message || '');
  }

  function isInvalidVideoPlayerError(err) {
    const msg = (err && (err.errMsg || err.message)) || '';
    return /invalid videoPlayerId|updateVideoPlayer/i.test(msg);
  }

  function toPromise(fn) {
    try {
      const result = fn();
      return result && typeof result.then === 'function' ? result : Promise.resolve(result);
    } catch (err) {
      return Promise.reject(err);
    }
  }

  function releaseAd(shouldDestroy, destroyDelay) {
    const targetAd = ad;
    const targetCloseHandler = closeHandler;
    const targetErrorHandler = errorHandler;
    if (!targetAd) return;

    if (targetCloseHandler && typeof targetAd.offClose === 'function') targetAd.offClose(targetCloseHandler);
    if (targetErrorHandler && typeof targetAd.offError === 'function') targetAd.offError(targetErrorHandler);
    if (ad === targetAd) {
      ad = null;
      closeHandler = null;
      errorHandler = null;
    }

    if (shouldDestroy && typeof targetAd.destroy === 'function') {
      const destroy = () => {
        try {
          targetAd.destroy();
        } catch (err) {
          console.error('销毁激励视频广告失败:', adUnitId, err);
        }
      };
      if (destroyDelay > 0) {
        setTimeout(destroy, destroyDelay);
      } else {
        destroy();
      }
    }
  }

  function detachAd(shouldDestroy) {
    releaseAd(shouldDestroy, 0);
  }

  function detachAdAfterClose() {
    releaseAd(true, 800);
  }

  function createAd() {
    if (typeof wx === 'undefined' || !wx.createRewardedVideoAd) return null;

    closeHandler = res => {
      detachAdAfterClose();
      if (res === undefined || (res && res.isEnded)) {
        finish(true);
      } else {
        finish(false, opts.cancelMessage || '完整观看广告后才能继续');
      }
    };
    errorHandler = err => {
      console.error('激励视频广告错误:', adUnitId, err);
    };

    try {
      ad = wx.createRewardedVideoAd({
        adUnitId,
        multiton: true
      });
      ad.onError(errorHandler);
      ad.onClose(closeHandler);
      return ad;
    } catch (err) {
      console.error('激励视频广告初始化失败:', adUnitId, err);
      detachAd(true);
      return null;
    }
  }

  function failShow(err) {
    console.error('激励视频广告显示失败:', adUnitId, err);
    detachAd(true);
    finish(false, opts.errorMessage || '广告暂不可用，请稍后再试');
  }

  function showWithRetry(hasRecreated) {
    detachAd(true);
    const currentAd = createAd();
    if (!currentAd) {
      finish(false, '当前微信版本不支持激励视频广告');
      return;
    }

    toPromise(() => currentAd.show())
      .catch(showErr => {
        if (!hasRecreated && isInvalidVideoPlayerError(showErr)) {
          detachAd(true);
          return toPromise(() => {
            const nextAd = createAd();
            if (!nextAd) throw showErr;
            return nextAd.load();
          }).then(() => {
            const nextAd = ad;
            if (!nextAd) throw showErr;
            return nextAd.show();
          });
        }
        return toPromise(() => currentAd.load())
          .then(() => currentAd.show())
          .catch(loadErr => {
            if (!hasRecreated && isInvalidVideoPlayerError(loadErr)) {
              detachAd(true);
              return toPromise(() => {
                const nextAd = createAd();
                if (!nextAd) throw loadErr;
                return nextAd.load();
              }).then(() => {
                const nextAd = ad;
                if (!nextAd) throw loadErr;
                return nextAd.show();
              });
            }
            throw loadErr || showErr;
          });
      })
      .catch(failShow);
  }

  function show(callback) {
    if (pendingCallback) return;

    pendingCallback = callback;
    showWithRetry(false);
  }

  function destroy() {
    pendingCallback = null;
    detachAd(true);
  }

  return {
    show,
    destroy
  };
}

module.exports = {
  SAVE_FILE_AD_UNIT_ID,
  EXPORT_IMAGE_AD_UNIT_ID,
  createRewardedVideoAd
};
