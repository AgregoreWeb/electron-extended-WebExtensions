const { webFrame, ipcRenderer, contextBridge } = require('electron')
const API_NAME = '$$chrome'
const FAKE_API_NAME = `___${API_NAME}`

/*
Injected from apiSpecs.js
*/

const { FUNCTION, EVENT, SETTING, makeEvent, spec } = require('./apiSpecs')

/*
-----------------------------
*/

run()

async function run () {
  const isExtensionPage = window.location.href.startsWith('chrome-extension://')
  // Running in background page or popup
  if (!isExtensionPage) return
  const extensionInfo = await getMainWorld()

  const rawAPI = {}

  let isContextIsolated = true
  try {
    // TODO: Account for this being invoked more than once?
    await contextBridge.exposeInMainWorld(FAKE_API_NAME, '')
  } catch {
    isContextIsolated = false
  }

  const toInjectOver = isContextIsolated ? rawAPI : extensionInfo.chrome

  injectAPIObject(toInjectOver, 'tabs', null, extensionInfo)
  injectAPIObject(toInjectOver, 'windows', null, extensionInfo)
  injectAPIObject(toInjectOver, 'debugger', 'debugger', extensionInfo)
  injectAPIObject(toInjectOver, 'browserAction', null, extensionInfo)
  injectAPIObject(toInjectOver, 'contextMenus', 'contextMenus', extensionInfo)
  injectAPIObject(toInjectOver, 'webNavigation', 'webNavigation', extensionInfo)
  injectAPIObject(toInjectOver, 'privacy', 'privacy', extensionInfo)

  if (isContextIsolated) {
    contextBridge.exposeInMainWorld(API_NAME, rawAPI)
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

async function injectAPIObject (rawAPI, type, permission, extensionInfo) {
  for (const [name, apiKind] of Object.entries(spec[type])) {
    if (typeof apiKind === 'object') {
      for (const [subName, subKind] of Object.entries(apiKind)) {
        if (subKind === SETTING) {
          injectProxy([type, name, subName, 'get'])
          injectProxy([type, name, subName, 'set'])
          injectProxy([type, name, subName, 'clear'])
        }
      }
    } else if (apiKind === FUNCTION) {
      injectFunctionAPI(rawAPI, type, name, permission, extensionInfo)
    } else if (apiKind === EVENT) {
      injectListenerAPI(rawAPI, type, name, permission, extensionInfo)
    } else {
      throw new TypeError(`Unknown API Kind: ${apiKind}`)
    }
  }
}

async function injectListenerAPI (rawAPI, type, name, permission, extensionInfo) {
  // Set up listener map for name (rawListener => intermediatelistener
  // Set up object for addListener, removeListener, hasListener

  const event = makeEvent(type, name)
  const listenerMap = new Map()

  const { id: extensionId } = extensionInfo

  injectProxy([type, name, 'addListener'])
  injectProxy([type, name, 'removeListener'])
  injectProxy([type, name, 'hasListener'])

  ensureExists(type, rawAPI)
  if (hasPermission(permission, extensionInfo.manifest)) {
    // Wire up listeners
    let idCounter = 1
    rawAPI[type][name] = {
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
    rawAPI[type][name] = {
      addListener () {
        console.error('Attempted to add listener without permission')
      },
      removeListener () {},
      hasListener () {}
    }
  }
}

async function injectFunctionAPI (rawAPI, type, name, permission, extensionInfo) {
  const event = makeEvent(type, name)
  const { manifest, id } = extensionInfo

  ensureExists(type, rawAPI)

  injectProxy([type, name])

  if (!hasPermission(permission, manifest)) {
    rawAPI[type][name] = async () => {
      throw new Error('Permission denied')
    }
  } else {
    rawAPI[type][name] = async (...args) => {
      const cb = args.at(-1)
      if (typeof cb === 'function') {
        const argsNoCB = args.slice(0, -1)
        return ipcRenderer.invoke(event, id, ...argsNoCB)
          .then(cb, (e) => {
            console.error(`Error invoking chrome.${type}.${name}`, e)
            rawAPI.runtime.lastError = e
          })
      } else {
        return ipcRenderer.invoke(event, id, ...args)
      }
    }
  }
}

async function getMainWorld () {
  const gotChrome = await webFrame.executeJavaScript('window.chrome')
  return await extensionInfoFromChrome(gotChrome)
}

async function injectProxy (segments) {
  let ensureScript = ''
  for (let parentIndex = 0; parentIndex < segments.length - 1; parentIndex++) {
    const parentSegments = segments.slice(0, parentIndex + 1).join('.')
    ensureScript += `if(!window.chrome.${parentSegments}) window.chrome.${parentSegments} = {}\n`
  }
  const path = segments.join('.')
  await webFrame.executeJavaScript(`
${ensureScript}
window.chrome.${path} = (...args) => ${API_NAME}.${path}(...args)
`)
}

async function extensionInfoFromChrome (chrome) {
  const id = chrome.runtime.id
  const manifest = await chrome.runtime.getManifest()
  return { id, manifest, chrome }
}
