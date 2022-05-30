const FUNCTION = 'function'
const EVENT = 'event'

const spec = {
  tabs: {
    create: FUNCTION,
    get: FUNCTION,
    query: FUNCTION,
    remove: FUNCTION,
    reload: FUNCTION,
    onActivated: EVENT,
    onCreated: EVENT,
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