const FUNCTION = 'function'
const EVENT = 'event'
const SETTING = 'setting'

const spec = {
  tabs: {
    create: FUNCTION,
    get: FUNCTION,
    getCurrent: FUNCTION,
    query: FUNCTION,
    remove: FUNCTION,
    reload: FUNCTION,
    // TODO: Replace this with the built in one eventually
    executeScript: FUNCTION,

    onActivated: EVENT,
    onCreated: EVENT,
    onUpdated: EVENT,
    onRemoved: EVENT
  },
  windows: {
    create: FUNCTION,
    get: FUNCTION,
    update: FUNCTION,
    remove: FUNCTION,

    onFocusChanged: EVENT,
    onCreated: EVENT,
    onUpdated: EVENT,
    onRemoved: EVENT
  },
  debugger: {
    attach: FUNCTION,
    detach: FUNCTION,
    getTargets: FUNCTION,
    sendCommand: FUNCTION,
    onDetach: EVENT,
    onEvent: EVENT
  },
  browserAction: {
    getTitle: FUNCTION,
    setTitle: FUNCTION,

    setIcon: FUNCTION,
    getIcon: FUNCTION,

    getPopup: FUNCTION,
    setPopup: FUNCTION,
    openPopup: FUNCTION,

    setBadgeText: FUNCTION,
    getBadgeText: FUNCTION,

    setBadgeBackgroundColor: FUNCTION,
    getBadgeBackgroundColor: FUNCTION,

    setBadgeTextColor: FUNCTION,
    getBadgeTextColor: FUNCTION,

    enable: FUNCTION,
    disable: FUNCTION,
    isEnabled: FUNCTION,

    onClicked: EVENT
  },
  contextMenus: {
    create: FUNCTION,
    remove: FUNCTION,
    removeAll: FUNCTION,
    update: FUNCTION,

    onClicked: EVENT
  },
  webNavigation: {
    getFrame: FUNCTION,
    getAllFrames: FUNCTION,

    onCreatedNavigationTarget: EVENT,
    onBeforeNavigate: EVENT,
    onCommitted: EVENT,
    onDOMContentLoaded: EVENT,
    onCompleted: EVENT,
    onErrorOccured: EVENT
  },
  privacy: {
    network: {
      networkPredictionEnabled: SETTING,
      webRTCIPHandlingPolicy: SETTING
    },
    websites: {
      hyperlinkAuditingEnabled: SETTING
    }
  }
}

function makeEvent (type, name) {
  return `extended-webextensions-${type}.${name}`
}

/* Exports get removed when placed into preloads file */
exports.FUNCTION = FUNCTION
exports.EVENT = EVENT
exports.spec = spec
exports.makeEvent = makeEvent
