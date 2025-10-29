export class ResponseModeController {
  constructor(player, cmcdV2Data, targets) {
    this.player = player;
    this.cmcdV2Data = cmcdV2Data;
    this.targets = targets.filter(target => target.mode === 'response' && target.enabled !== false);
    this.batches = new Map();
    this.originalXhrHook = null;

    this.init();
  }

  init() {
    if (this.targets.length === 0) return;

    this.initializeBatches();
    this.setupResponseInterception();
  }

  initializeBatches() {
    this.targets.forEach(target => {
      if (target.transmissionMode === 'json' || target.transmissionMode === 'body') {
        this.batches.set(target, []);
      }
    });
  }

  setupResponseInterception() {
    const player = this.player;

    player.ready(() => {
      player.on('xhr-hooks-ready', () => {
        const tech = player.tech();
        if (tech && tech.vhs && tech.vhs.xhr) {
          this.setupXhrHooks(tech.vhs.xhr);
        }
      });
    });
  }

  setupXhrHooks(xhr) {
    const originalOnRequest = xhr.onRequest;

    xhr.onRequest = (options) => {
      const requestStartTime = Date.now();
      this.cmcdV2Data.storeRequestStartTime(options.uri, requestStartTime);

      if (originalOnRequest) {
        return originalOnRequest(options);
      }
      return options;
    };

    xhr.hooks.response.push((request, next) => {
      this.handleResponse(request);
      next();
    });
  }

  handleResponse(request) {
    try {
      const { uri, response } = request;
      const requestStartTime = this.cmcdV2Data.getRequestStartTime(uri);
      const endTime = Date.now();

      if (!requestStartTime) return;

      const firstByteTime = response && response.responseStart
        ? response.responseStart
        : requestStartTime + 50;

      this.targets.forEach(target => {
        if (this.shouldProcessRequest(target, uri)) {
          this.processResponseForTarget(target, uri, request.xhr, requestStartTime, firstByteTime, endTime);
        }
      });

      this.cmcdV2Data.clearRequestStartTime(uri);
    } catch (error) {
      console.error('Error in ResponseModeController.handleResponse:', error);
    }
  }

  shouldProcessRequest(target, uri) {
    if (!target.includeOnRequests || target.includeOnRequests.length === 0) {
      return true;
    }

    return target.includeOnRequests.some(requestType => {
      switch (requestType) {
        case 'manifest':
        case 'mpd':
          return uri.includes('.mpd') || uri.includes('.m3u8');
        case 'segment':
          return uri.includes('.ts') || uri.includes('.m4s') || uri.includes('.mp4');
        default:
          return true;
      }
    });
  }

  processResponseForTarget(target, uri, xhr, requestStartTime, firstByteTime, endTime) {
    try {
      const responseData = this.cmcdV2Data.getResponseModeKeys(uri, xhr, requestStartTime, firstByteTime, endTime);

      const filteredData = this.filterDataByKeys(responseData, target.enabledKeys);

      if (Object.keys(filteredData).length === 0) return;

      this.sendDataToTarget(target, filteredData);
    } catch (error) {
      console.error('Error processing response for target:', error);
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

    const batchSize = target.batchSize || 5;
    if (batch.length >= batchSize) {
      this.sendBatch(target, [...batch]);
      batch.length = 0;
    }
  }

  sendBatch(target, batchData) {
    if (!target.url || batchData.length === 0) return;

    fetch(target.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(batchData),
    })
    .then(response => {
      if (!response.ok) {
        console.warn(`CMCD Response Mode batch reporting failed: ${response.status}`);
      }
    })
    .catch(error => {
      console.error('Error sending CMCD Response Mode batch data:', error);
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
          console.warn(`CMCD Response Mode query reporting failed: ${response.status}`);
        }
      })
      .catch(error => {
        console.error('Error sending CMCD Response Mode query data:', error);
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
          console.warn(`CMCD Response Mode header reporting failed: ${response.status}`);
        }
      })
      .catch(error => {
        console.error('Error sending CMCD Response Mode header data:', error);
      });
    } catch (error) {
      console.error('Error creating header request:', error);
    }
  }

  destroy() {
    this.batches.clear();

    this.player = null;
    this.cmcdV2Data = null;
    this.targets = null;
  }
}