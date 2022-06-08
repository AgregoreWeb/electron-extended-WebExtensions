/* global chrome */
const ISOLATED_WORLD_ID_EXTENSIONS = 1 << 20

const { webFrame, ipcRenderer } = require('electron')

/*
Injected from apiSpecs.js
*/

const FUNCTION = 'function'
const EVENT = 'event'

const spec = {
  tabs: {
    create: FUNCTION,
    get: FUNCTION,
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
  },
  webNavigation: {
    getFrame: FUNCTION,
    getAllFrames: FUNCTION,

    onBeforeNavigate: EVENT,
    onCommitted: EVENT,
    onDOMContentLoaded: EVENT,
    onCompleted: EVENT,
    onErrorOccured: EVENT
  }
}

function makeEvent (type, name) {
  return `extended-webextensions-${type}.${name}`
}

/* Exports get removed when placed into preloads file */






/*
-----------------------------
*/

run()

async function run () {
  if (chrome.extension) {
    // Running in background page
    const extensionInfo = await extensionInfoFromChrome(chrome)
    console.log({ extensionInfo })

    injectAPIObject('tabs', null, extensionInfo)
    injectAPIObject('debugger', 'debugger', extensionInfo)
    injectAPIObject('browserAction', null, extensionInfo)
    injectAPIObject('contextMenus', 'contextMenus', extensionInfo)
    injectAPIObject('webNavigation', 'webNavigation', extensionInfo)
  } else {
    // Running in frame with content script?
    const foundWorlds = await findContentScriptWorlds()
    console.log({ chrome, foundWorlds })
  }
}

function ensureExists (type, chrome) {
  if (!chrome[type]) chrome[type] = {}
}

function hasPermission (permission, manifest) {
  if (permission === null) return true
  if (!Array.isArray(manifest.permissions)) return false
  return manifest.permissions.includes(permission)
}

async function injectAPIObject (type, permission, extensionInfo) {
  for (const [name, apiKind] of Object.entries(spec[type])) {
    if (apiKind === FUNCTION) {
      injectFunctionAPI(type, name, permission, extensionInfo)
    } else if (apiKind === EVENT) {
      injectListenerAPI(type, name, permission, extensionInfo)
    } else {
      throw new TypeError(`Unknown API Kind: ${apiKind}`)
    }
  }
}

async function injectListenerAPI (type, name, permission, extensionInfo) {
  // Set up listener map for name (rawListener => intermediatelistener
  // Set up object for addListener, removeListener, hasListener

  const event = makeEvent(type, name)
  const listenerMap = new Map()

  const extensionId = extensionInfo.id

  ensureExists(type, extensionInfo.chrome)
  if (hasPermission(permission, extensionInfo.manifest)) {
    // Wire up listeners
    let idCounter = 1
    chrome[type][name] = {
      addListener (listener) {
        const listenerId = idCounter++
        function handler (e, gotExtensionId, gotListenerId, ...args) {
          if (gotExtensionId !== extensionId || gotListenerId !== listenerId) return
          listener(...args)
        }
        listenerMap.set(listener, { listenerId, handler })
        ipcRenderer.on(event, handler)
        const listenEvent = event + '-add'
        ipcRenderer.send(listenEvent, extensionId, listenerId)
      },
      removeListener (listener) {
        if (!listenerMap.has(listener)) return
        const { handler, listenerId } = listenerMap.get(listener)
        ipcRenderer.removeListener(event, handler)
        listenerMap.delete(listener)
        const removeEvent = event + '-remove'
        ipcRenderer.send(removeEvent, extensionId, listenerId)
      },
      hasListener (listener) {
        return listenerMap.has(listener)
      }
    }
  } else {
    // No-op these listeners
    chrome[type][name] = {
      addListener () {
        console.error('Attempted to add listener without permission')
      },
      removeListener () {},
      hasListener () {}
    }
  }
}

async function injectFunctionAPI (type, name, permission, extensionInfo) {
  const event = makeEvent(type, name)
  const { chrome, manifest, id } = extensionInfo

  ensureExists(type, chrome)

  if (!hasPermission(permission, manifest)) {
    chrome[type][name] = async () => {
      throw new Error('Permission denied')
    }
  } else {
    chrome[type][name] = async (...args) => {
      const cb = args.at(-1)
      if (typeof cb === 'function') {
        const argsNoCB = args.slice(0, -1)
        return ipcRenderer.invoke(event, id, ...argsNoCB)
          .then(cb, (e) => {
            chrome.runtime.lastError = e
          })
      } else {
        return ipcRenderer.invoke(event, id, ...args)
      }
    }
  }
}

async function findContentScriptWorlds () {
  const foundWorlds = []
  let n = 0
  while (true) {
    const worldId = ISOLATED_WORLD_ID_EXTENSIONS + n
    const gotChrome = await webFrame.executeJavaScriptInIsolatedWorld(worldId, [{ code: 'window.chrome' }])
    const extension = gotChrome?.extension
    if (extension) {
      const extensionInfo = await extensionInfoFromChrome(gotChrome)
      foundWorlds.push({
        worldId,
        ...extensionInfo
      })
    } else {
      break
    }
    n++
  }
  return foundWorlds
}

async function extensionInfoFromChrome (chrome) {
  const id = chrome.runtime.id
  const manifest = await chrome.runtime.getManifest()
  return { id, manifest, chrome }
}
