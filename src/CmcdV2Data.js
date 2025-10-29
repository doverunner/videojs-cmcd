import { CmcdObjectType } from '@svta/common-media-library/cmcd/CmcdObjectType';
import { CmcdStreamType } from '@svta/common-media-library/cmcd/CmcdStreamType';
import { CmcdStreamingFormat } from '@svta/common-media-library/cmcd/CmcdStreamingFormat';

export class CmcdV2Data {
  constructor(player, sid, cid) {
    this.player = player;
    this.vhs = player.tech(true).vhs;
    this.sid = sid;
    this.cid = cid;
    this.sequenceNumber = 0;
    this.mediaStartDelay = null;
    this.mediaStartDelaySent = false;
    this.requestStartTimes = new Map();
  }

  getVersion() {
    return 2;
  }

  getTimestamp() {
    return Date.now();
  }

  getTimeToFirstByte(requestStartTime, firstByteTime) {
    if (!requestStartTime || !firstByteTime) return undefined;
    return Math.round(firstByteTime - requestStartTime);
  }

  getTimeToLastByte(requestStartTime, endTime) {
    if (!requestStartTime || !endTime) return undefined;
    return Math.round(endTime - requestStartTime);
  }

  getResponseCode(xhr) {
    return xhr && xhr.status ? xhr.status : undefined;
  }

  getUrl(uri) {
    if (!uri) return undefined;
    return uri.split('?')[0];
  }

  getPlayheadTime() {
    try {
      const isLive = this.player.duration().toString() === 'Infinity' || this.player.duration() === 0;
      if (isLive) {
        return Date.now();
      } else {
        return Math.round(this.player.currentTime() * 1000);
      }
    } catch (e) {
      return undefined;
    }
  }

  getLiveLatency() {
    try {
      if (this.player.duration().toString() !== 'Infinity' && this.player.duration() !== 0) {
        return undefined;
      }

      const currentTime = this.player.currentTime();
      const liveEdge = this.vhs && this.vhs.seekable && this.vhs.seekable().length > 0
        ? this.vhs.seekable().end(this.vhs.seekable().length - 1)
        : undefined;

      if (liveEdge && currentTime) {
        return Math.round((liveEdge - currentTime) * 1000);
      }

      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  getPlayerState() {
    try {
      const video = this.player.el().querySelector('video');
      if (!video) return undefined;

      if (video.seeking) return 'k';
      if (this.player.buffering && this.player.buffering()) return 'r';
      if (video.ended) return 'e';

      if (video.paused) {
        if (video.currentTime === 0 && video.played.length === 0) {
          return 'p';
        }
        return 'a';
      }

      if (video.readyState < 3) {
        return 's';
      }

      return 'p';
    } catch (e) {
      return undefined;
    }
  }

  getMediaStartDelay() {
    if (this.mediaStartDelaySent) return undefined;
    if (this.mediaStartDelay !== null) {
      this.mediaStartDelaySent = true;
      return this.mediaStartDelay;
    }
    return undefined;
  }

  setMediaStartDelay(delay) {
    if (this.mediaStartDelay === null) {
      this.mediaStartDelay = delay;
    }
  }

  getDroppedFrames() {
    try {
      const video = this.player.el().querySelector('video');
      if (video && video.getVideoPlaybackQuality) {
        return video.getVideoPlaybackQuality().droppedVideoFrames;
      }
      return undefined;
    } catch (e) {
      return undefined;
    }
  }

  getSequenceNumber() {
    const sn = this.sequenceNumber;
    this.sequenceNumber++;
    return sn;
  }

  getEventType(eventName) {
    const eventMap = {
      'play': 'ps',
      'pause': 'ps',
      'seeking': 'ps',
      'waiting': 'ps',
      'ended': 'ps',
      'error': 'e',
      'timeupdate': 't'
    };
    return eventMap[eventName] || eventName;
  }

  getErrorCode(error) {
    if (!error) return undefined;
    return error.code || error.status || undefined;
  }

  storeRequestStartTime(uri, timestamp) {
    this.requestStartTimes.set(uri, timestamp);
  }

  getRequestStartTime(uri) {
    return this.requestStartTimes.get(uri);
  }

  clearRequestStartTime(uri) {
    this.requestStartTimes.delete(uri);
  }

  filterNullUndefined(obj) {
    const filtered = {};
    for (const key in obj) {
      if (obj[key] !== null && obj[key] !== undefined) {
        filtered[key] = obj[key];
      }
    }
    return filtered;
  }

  getResponseModeKeys(uri, xhr, requestStartTime, firstByteTime, endTime) {
    const keys = {};

    keys.ts = this.getTimestamp();

    if (requestStartTime) {
      keys.ttfb = this.getTimeToFirstByte(requestStartTime, firstByteTime);
      keys.ttlb = this.getTimeToLastByte(requestStartTime, endTime);
    }

    keys.rc = this.getResponseCode(xhr);
    keys.url = this.getUrl(uri);
    keys.pt = this.getPlayheadTime();
    keys.ltc = this.getLiveLatency();
    keys.pr = this.player.playbackRate();
    keys.sta = this.getPlayerState();
    keys.msd = this.getMediaStartDelay();
    keys.df = this.getDroppedFrames();
    keys.sn = this.getSequenceNumber();

    keys.sid = this.sid;
    keys.cid = this.cid;
    keys.v = this.getVersion();

    return this.filterNullUndefined(keys);
  }

  getEventModeKeys(eventType, eventData = {}) {
    const keys = {};

    keys.ts = this.getTimestamp();
    keys.e = this.getEventType(eventType);
    keys.pt = this.getPlayheadTime();
    keys.ltc = this.getLiveLatency();
    keys.pr = this.player.playbackRate();
    keys.sta = this.getPlayerState();
    keys.msd = this.getMediaStartDelay();
    keys.df = this.getDroppedFrames();
    keys.sn = this.getSequenceNumber();

    if (eventData.error) {
      keys.ec = this.getErrorCode(eventData.error);
    }

    keys.sid = this.sid;
    keys.cid = this.cid;
    keys.v = this.getVersion();

    return this.filterNullUndefined(keys);
  }

  formatDataForTransmission(data, transmissionMode) {
    const filtered = this.filterNullUndefined(data);

    switch (transmissionMode) {
      case 'json':
        return filtered;

      case 'query':
        return Object.entries(filtered).map(([key, value]) => {
          if (typeof value === 'string') {
            const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            return `${key}="${escaped}"`;
          }
          return `${key}=${value}`;
        }).join(',');

      case 'header':
        const headers = {};
        Object.entries(filtered).forEach(([key, value]) => {
          const headerName = `CMCD-${key.charAt(0).toUpperCase()}`;
          if (!headers[headerName]) {
            headers[headerName] = [];
          }

          if (typeof value === 'string') {
            const escaped = value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
            headers[headerName].push(`${key}="${escaped}"`);
          } else {
            headers[headerName].push(`${key}=${value}`);
          }
        });

        Object.keys(headers).forEach(headerName => {
          headers[headerName] = headers[headerName].join(',');
        });

        return headers;

      default:
        return filtered;
    }
  }
}