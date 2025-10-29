import { appendCmcdHeaders } from '@svta/common-media-library/cmcd/appendCmcdHeaders';
import { appendCmcdQuery } from '@svta/common-media-library/cmcd/appendCmcdQuery';
import { uuid } from '@svta/common-media-library/utils/uuid';
import videojs from 'video.js';
import { version as VERSION } from '../package.json';
import { CmcdData } from './CmcdData.js';
import { CmcdV2Data } from './CmcdV2Data.js';
import { ResponseModeController } from './ResponseModeController.js';
import { EventModeController } from './EventModeController.js';

const Plugin = videojs.getPlugin('plugin');

let isWaitingEvent = true;

// Default options for the plugin.
const defaults = {};

/**
 * An advanced Video.js plugin. For more information on the API
 *
 * See: https://blog.videojs.com/feature-spotlight-advanced-plugins/
 */
class Cmcd extends Plugin {

  /**
   * Create a Cmcd plugin instance.
   *
   * @param  {Player} player
   *         A Video.js Player instance.
   *
   * @param  {Object} [options]
   *         An optional options object.
   *
   *         While not a core part of the Video.js plugin architecture, a
   *         second argument of options is a convenient way to accept inputs
   *         from your plugin's caller.
   */
  constructor(player, options) {
    // the parent class will add player under this.player
    super(player);
    this.options = videojs.obj.merge(defaults, options);
    const {sid, cid, useHeaders, version = 1, targets} = options || {};

    this.cid = cid;
    this.sid = sid || uuid();
    this.useHeaders = useHeaders;
    this.version = version;
    this.targets = targets || [];

    // V2 controllers
    this.responseModeController = null;
    this.eventModeController = null;

    this.player.ready(() => {
      player.addClass('vjs-cmcd');

      if (this.version === 2) {
        this.initializeV2(player);
      } else {
        this.initializeV1(player);
      }
    });
  }

  initializeV1(player) {
    handleEvents(player);

    player.on('xhr-hooks-ready', () => {

      const playerXhrRequestHook = (opts) => {
        const cmcd = new CmcdData(this.player, this.sid, this.cid);
        const keys = cmcd.getKeys(opts.uri, isWaitingEvent, this.player.currentSrc());

        if (this.useHeaders) {
          const headers = appendCmcdHeaders({}, keys);

          opts.beforeSend = (xhr) => {
            for (const h in headers) {
              xhr.setRequestHeader(h, headers[h]);
            }
          };
        } else {
          opts.uri = appendCmcdQuery(opts.uri, keys);
        }

        return opts;
      };

      player.tech().vhs.xhr.onRequest(playerXhrRequestHook);
    });
  }

  initializeV2(player) {
    const cmcdV2Data = new CmcdV2Data(player, this.sid, this.cid);

    // Initialize Response Mode Controller
    const responseModeTargets = this.targets.filter(target => target.mode === 'response');
    if (responseModeTargets.length > 0) {
      this.responseModeController = new ResponseModeController(player, cmcdV2Data, responseModeTargets);
    }

    // Initialize Event Mode Controller
    const eventModeTargets = this.targets.filter(target => target.mode === 'event');
    if (eventModeTargets.length > 0) {
      this.eventModeController = new EventModeController(player, cmcdV2Data, eventModeTargets);
    }

    // Keep v1 request mode for backward compatibility
    const requestModeTargets = this.targets.filter(target => target.mode === 'request' || !target.mode);
    if (requestModeTargets.length > 0 || this.targets.length === 0) {
      this.initializeV1(player);
    }
  }

  setId(id) {
    if (id.sid) {
      this.sid = id.sid;
    }
    if (id.cid) {
      this.cid = id.cid;
    }
  }

  getId() {
    return {
      sid: this.sid,
      cid: this.cid
    };
  }

  getSessionId() {
    return this.sid;
  }

  destroy() {
    if (this.responseModeController) {
      this.responseModeController.destroy();
      this.responseModeController = null;
    }

    if (this.eventModeController) {
      this.eventModeController.destroy();
      this.eventModeController = null;
    }

    super.destroy();
  }

}

function handleEvents(player) {
  // startup
  player.on('loadedmetadata', function() {
    isWaitingEvent = false;
  });
  // seeking or buffer-empty event
  player.on('waiting', function() {
    isWaitingEvent = true;
  });
  // all it's okey
  player.on('canplay', function() {
    isWaitingEvent = false;
  });
}

// Define default values for the plugin's `state` object here.
Cmcd.defaultState = {};

// Include the version number.
Cmcd.VERSION = VERSION;

// Register the plugin with video.js.
videojs.registerPlugin('cmcd', Cmcd);

export default Cmcd;
