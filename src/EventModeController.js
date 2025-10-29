export class EventModeController {
  constructor(player, cmcdV2Data, targets) {
    this.player = player;
    this.cmcdV2Data = cmcdV2Data;
    this.targets = targets.filter(target => target.mode === 'event' && target.enabled !== false);
    this.batches = new Map();
    this.timers = new Map();
    this.sendingFlags = new Map();
    this.mediaStartTime = null;

    this.init();
  }

  init() {
    if (this.targets.length === 0) return;

    this.initializeBatches();
    this.setupEventListeners();
    this.setupTimeIntervals();
  }

  initializeBatches() {
    this.targets.forEach(target => {
      if (target.transmissionMode === 'json' || target.transmissionMode === 'body') {
        this.batches.set(target, []);
        this.sendingFlags.set(target, false);
      }

      if (target.batchTimer && target.batchTimer > 0) {
        const timer = setInterval(() => {
          if (!this.sendingFlags.get(target)) {
            this.flushBatch(target);
          }
        }, target.batchTimer * 1000);
        this.timers.set(target, timer);
      }
    });
  }

  setupEventListeners() {
    const player = this.player;

    player.ready(() => {
      const videoElement = player.el().querySelector('video');
      if (!videoElement) return;

      const eventMappings = [
        { domEvent: 'play', cmcdEvent: 'ps' },
        { domEvent: 'pause', cmcdEvent: 'ps' },
        { domEvent: 'seeking', cmcdEvent: 'ps' },
        { domEvent: 'waiting', cmcdEvent: 'ps' },
        { domEvent: 'ended', cmcdEvent: 'ps' },
        { domEvent: 'error', cmcdEvent: 'e' },
        { domEvent: 'volumechange', cmcdEvent: videoElement.muted ? 'm' : 'um' }
      ];

      eventMappings.forEach(({ domEvent, cmcdEvent }) => {
        videoElement.addEventListener(domEvent, (event) => {
          this.handleMediaEvent(domEvent, cmcdEvent, { event });
        });
      });

      player.on('play', () => {
        if (this.mediaStartTime === null) {
          this.mediaStartTime = Date.now();
        }
      });

      player.on('playing', () => {
        if (this.mediaStartTime !== null) {
          const delay = Date.now() - this.mediaStartTime;
          this.cmcdV2Data.setMediaStartDelay(delay);
          this.mediaStartTime = null;
        }
      });

      player.on('error', (event) => {
        this.handleMediaEvent('error', 'e', {
          error: {
            code: event.code || event.type,
            message: event.message
          }
        });
      });

      player.on('loadstart', () => {
        this.mediaStartTime = Date.now();
      });
    });
  }

  setupTimeIntervals() {
    this.targets.forEach(target => {
      if (target.timeInterval && target.timeInterval > 0) {
        const timer = setInterval(() => {
          this.handleMediaEvent('timeupdate', 't', {});
        }, target.timeInterval * 1000);
        this.timers.set(`interval_${target.url}`, timer);
      }
    });
  }

  handleMediaEvent(eventType, cmcdEventType, eventData = {}) {
    this.targets.forEach(target => {
      if (this.shouldProcessEvent(target, cmcdEventType)) {
        this.processEventForTarget(target, eventType, eventData);
      }
    });
  }

  shouldProcessEvent(target, cmcdEventType) {
    if (!target.events || target.events.length === 0) {
      return true;
    }

    return target.events.includes(cmcdEventType);
  }

  processEventForTarget(target, eventType, eventData) {
    try {
      const eventModeData = this.cmcdV2Data.getEventModeKeys(eventType, eventData);

      const filteredData = this.filterDataByKeys(eventModeData, target.enabledKeys);

      if (Object.keys(filteredData).length === 0) return;

      this.sendDataToTarget(target, filteredData);
    } catch (error) {
      console.error('Error processing event for target:', error);
    }
  }

  filterDataByKeys(data, enabledKeys) {
    if (!enabledKeys || enabledKeys.length === 0) {
      return data;
    }

    const filtered = {};
    enabledKeys.forEach(key => {
      if (data[key] !== undefined) {
        filtered[key] = data[key];
      }
    });

    return filtered;
  }

  sendDataToTarget(target, data) {
    const transmissionMode = target.transmissionMode || 'query';

    switch (transmissionMode) {
      case 'json':
      case 'body':
        this.addToBatch(target, data);
        break;
      case 'query':
        this.sendQueryRequest(target, data);
        break;
      case 'header':
        this.sendHeaderRequest(target, data);
        break;
    }
  }

  addToBatch(target, data) {
    const batch = this.batches.get(target);
    if (!batch) return;

    batch.push(data);

    const batchSize = target.batchSize || 10;

    if (batch.length > batchSize) {
      const overflow = batch.length - batchSize;
      const removed = batch.splice(0, overflow);
      console.warn(`[CMCD EventMode] Batch exceeded limit (${batch.length + overflow}), removed ${removed.length} oldest event(s)`);
    }

    if (batch.length >= batchSize && !this.sendingFlags.get(target)) {
      this.sendBatch(target, [...batch]);
    }
  }

  flushBatch(target) {
    const batch = this.batches.get(target);
    if (!batch || batch.length === 0) return;

    if (this.sendingFlags.get(target)) {
      console.log('[CMCD EventMode] Already sending for this target, skipping flush');
      return;
    }

    this.sendBatch(target, [...batch]);
  }

  sendBatch(target, batchData) {
    if (!target.url || batchData.length === 0) return;

    const batch = this.batches.get(target);
    if (!batch) return;

    if (this.sendingFlags.get(target)) {
      console.log('[CMCD EventMode] Already sending for this target, skipping sendBatch');
      return;
    }

    this.sendingFlags.set(target, true);

    const batchToSend = batch.splice(0, batch.length);

    if (target.beforeSend && typeof target.beforeSend === 'function') {
      try {
        target.beforeSend(batchToSend);
      } catch (e) {
        console.error('[CMCD EventMode] Error in beforeSend callback:', e);
      }
    }

    console.log(`[CMCD EventMode] Sending batch of ${batchToSend.length} CMCD events.`);

    fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchToSend),
    })
    .then(response => {
      if (response.ok) {
        console.log('[CMCD EventMode] CMCD batch data reported successfully.');

        if (target.afterSend && typeof target.afterSend === 'function') {
          try {
            target.afterSend(response);
          } catch (e) {
            console.error('[CMCD EventMode] Error in afterSend callback:', e);
          }
        }
      } else {
        console.warn(`CMCD Event Mode batch reporting failed: ${response.status}`);

        const batchSize = target.batchSize || 10;
        const currentBatchSize = batch.length;
        const totalSize = currentBatchSize + batchToSend.length;

        if (totalSize > batchSize) {
          const overflow = totalSize - batchSize;
          const trimmedBatch = batchToSend.slice(overflow);
          console.warn(`[CMCD EventMode] After retry, would exceed limit. Trimmed ${overflow} oldest event(s) from failed batch`);
          batch.unshift(...trimmedBatch);
        } else {
          batch.unshift(...batchToSend);
        }
      }
    })
    .catch(error => {
      console.error('Error sending CMCD Event Mode batch data:', error);

      const batchSize = target.batchSize || 10;
      const currentBatchSize = batch.length;
      const totalSize = currentBatchSize + batchToSend.length;

      if (totalSize > batchSize) {
        const overflow = totalSize - batchSize;
        const trimmedBatch = batchToSend.slice(overflow);
        console.warn(`[CMCD EventMode] After retry, would exceed limit. Trimmed ${overflow} oldest event(s) from failed batch`);
        batch.unshift(...trimmedBatch);
      } else {
        batch.unshift(...batchToSend);
      }
    })
    .finally(() => {
      this.sendingFlags.set(target, false);
    });
  }

  sendQueryRequest(target, data) {
    if (!target.url) return;

    try {
      const queryString = this.cmcdV2Data.formatDataForTransmission(data, 'query');
      const url = new URL(target.url);
      url.searchParams.set('CMCD', queryString);

      fetch(url.toString(), {
        method: 'GET',
      })
      .then(response => {
        if (!response.ok) {
          console.warn(`CMCD Event Mode query reporting failed: ${response.status}`);
        }
      })
      .catch(error => {
        console.error('Error sending CMCD Event Mode query data:', error);
      });
    } catch (error) {
      console.error('Error creating query request:', error);
    }
  }

  sendHeaderRequest(target, data) {
    if (!target.url) return;

    try {
      const headers = this.cmcdV2Data.formatDataForTransmission(data, 'header');

      fetch(target.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...headers,
        },
        body: JSON.stringify({}),
      })
      .then(response => {
        if (!response.ok) {
          console.warn(`CMCD Event Mode header reporting failed: ${response.status}`);
        }
      })
      .catch(error => {
        console.error('Error sending CMCD Event Mode header data:', error);
      });
    } catch (error) {
      console.error('Error creating header request:', error);
    }
  }

  destroy() {
    this.timers.forEach(timer => clearInterval(timer));
    this.timers.clear();
    this.batches.clear();

    this.player = null;
    this.cmcdV2Data = null;
    this.targets = null;
  }
}