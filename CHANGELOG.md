<a name="2.0.0"></a>
## 2.0.0 (2024-09-30)

### Features

* **CMCD v2 Support**: Add complete CMCD v2 implementation with Response Mode and Event Mode
* **Response Mode**: Collect network timing metrics (TTFB, TTLB, Response Codes) after HTTP responses
* **Event Mode**: Report player events and state changes in real-time
* **Multiple Transmission Modes**: Support JSON batching, Query parameters, and HTTP headers
* **Flexible Targeting**: Configure multiple reporting endpoints with different settings
* **Advanced Metrics**: New v2 metrics including timestamps, playhead time, live latency, player state, media start delay, dropped frames, and sequence numbers
* **Backward Compatibility**: Full compatibility with existing v1 configurations

### Breaking Changes

* Minimum required version updated to support v2 features
* Configuration structure extended for v2 targets (v1 configs still supported)

### Files Added

* `src/CmcdV2Data.js`: v2 metrics collection and formatting
* `src/ResponseModeController.js`: HTTP response monitoring and reporting
* `src/EventModeController.js`: Player event monitoring and reporting
* `cmcd-v2-example.html`: Complete v2 usage example

<a name="1.0.8"></a>
## 1.0.8 (2023-07-19)

### Features

* add common media library (#29) ([0024b80](https://github.com/montevideo-tech/videojs-cmcd/commit/0024b80)), closes [#29](https://github.com/montevideo-tech/videojs-cmcd/issues/29)

### Bug Fixes

* cant pass cid through instance of the plugin ([04e355a](https://github.com/montevideo-tech/videojs-cmcd/commit/04e355a))
* changed npm version ([b21be4b](https://github.com/montevideo-tech/videojs-cmcd/commit/b21be4b))
* changed plugin version ([58c567b](https://github.com/montevideo-tech/videojs-cmcd/commit/58c567b))
* erased example folder ([a1a7298](https://github.com/montevideo-tech/videojs-cmcd/commit/a1a7298))
* fix videojs params ([68d592e](https://github.com/montevideo-tech/videojs-cmcd/commit/68d592e))
* modified readme ([b236b1e](https://github.com/montevideo-tech/videojs-cmcd/commit/b236b1e))
* Modified readme ([31d21a6](https://github.com/montevideo-tech/videojs-cmcd/commit/31d21a6))
* readme example fix ([6df5ed0](https://github.com/montevideo-tech/videojs-cmcd/commit/6df5ed0))

<a name="1.0.2"></a>
## 1.0.2 (2023-06-14)

<a name="1.0.0"></a>
# 1.0.0 (2023-04-13)

