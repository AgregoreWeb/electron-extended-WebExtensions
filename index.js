const EventEmtiter = require('events')
const { join } = require('path')

const {
  ipcMain,
  MenuItem,
  app,
  webContents: WebContents
} = require('electron')

const PRELOAD_PATH = join(__dirname, 'preloads.js')

const {
  spec,
  FUNCTION,
  EVENT,
  makeEvent
} = require('./apiSpecs')

const TAB_QUERY_PROPERTIES = ['url', 'active', 'status', 'title']

class WebNavigation extends EventEmtiter {
  constructor ({ tabs }) {
    super()
    this.tabs = tabs

    // Listen to new tabs
    this.tabs.on('created', (webContents) => this.listenTab(webContents))
    // Listen to existing tabs
    for (const webContents of this.tabs) {
      this.listenTab(webContents)
    }
  }

  listenTab (webContents) {
    // Listen for destroy to stop listening
    webContents.on('will-navigate', (event, url) => {
      const details = { url }
      this.dispatchOnBeforeNavigate(webContents, event, details)
    })
    webContents.on('did-start-navigation', (event, url, isInPlace, isMainFrame, frameProcessId, frameRoutingId) => {
      const details = { url, isInPlace, isMainFrame, frameProcessId, frameRoutingId }
      this.dispatchOnCommitted(webContents, event, details)
    })
    webContents.on('did-frame-finish-load', (event, isMainFrame, frameProcessId, frameRoutingId) => {
      // Same as dom load
      // Is it the same as onCompleted? Can't find a better event for it
      const details = { isMainFrame, frameProcessId, frameRoutingId }
      this.dispatchOnDOMContentLoaded(webContents, event, details)
      this.dispatchOnCompleted(webContents, event, details)
    })
    webContents.on('did-fail-load', (event, code, description, url, isMainFrame, frameProcessId, frameRoutingId) => {
      const details = { url, isMainFrame, frameProcessId, frameRoutingId }
      const error = { code, description }
      this.dispatchOnErrorOccured(webContents, event, details, error)
    })
  }

  mainFrameToFrameData (frame) {
    const frameId = frame.routingId
    const parentFrameId = frame.parent ? frame.parent.routingId : -1
    const url = frame.url

    return {
      frameId,
      parentFrameId,
      url
    }
  }

  async getAllFrames (extensionId, { tabId } = {}) {
    const webContents = await this.tabs.getRaw(tabId)
    // TODO: Check for permissions?
    const allFrames = webContents.mainFrame.framesInSubtree

    return allFrames.map((frame) => this.mainFrameToFrameData(frame))
  }

  async getFrame (extensionId, { tabId, frameId } = {}) {
    const webContents = await this.tabs.getRaw(tabId)

    if (frameId) {
      const frame = webContents.mainFrame.framesInSubtree
        .find(({ routingId }) => routingId === frameId)
      if (!frame) throw new Error('Frame ID not found')
      return this.mainFrameToFrameData(frame)
    } else {
      return this.mainFrameToFrameData(webContents.mainFrame)
    }
  }

  async onBeforeNavigate (extensionId, handler, filter = {}) {
    // TODO: Filter by URLs
    this.on('onBeforeNavigate', handler)
    return () => this.removeListener('onBeforeNavigate', handler)
  }

  async onCommitted (extensionId, handler, filter = {}) {
    // TODO: Filter by URLs
    this.on('onCommitted', handler)
    return () => this.removeListener('onCommitted', handler)
  }

  async onDOMContentLoaded (extensionId, handler, filter = {}) {
    // TODO: Filter by URLs
    this.on('onDOMContentLoaded', handler)
    return () => this.removeListener('onDOMContentLoaded', handler)
  }

  async onCompleted (extensionId, handler, filter = {}) {
    // TODO: Filter by URLs
    this.on('onCompleted', handler)
    return () => this.removeListener('onCompleted', handler)
  }

  async onErrorOccured (extensionId, handler, filter = {}) {
    // TODO: Filter by URLs
    this.on('onErrorOccured', handler)
    return () => this.removeListener('onErrorOccured', handler)
  }

  async dispatchOnBeforeNavigate (webContents, event, { url }) {
    const frame = this.mainFrameToFrameData(webContents.mainFrame)
    const tabId = webContents.id
    const timeStamp = Date.now()
    const details = { ...frame, url, tabId, timeStamp }
    this.emit('onBeforeNavigate', details)
  }

  async dispatchOnCommitted (webContents, event, { url, frameRoutingId: frameId }) {
    const tabId = webContents.id
    const frame = await this.getFrame(null, { tabId, frameId })
    const timeStamp = Date.now()
    const details = { ...frame, url, tabId, timeStamp }
    this.emit('onCommitted', details)
  }

  async dispatchOnDOMContentLoaded (webContents, event, { frameRoutingId: frameId }) {
    const tabId = webContents.id
    const frame = await this.getFrame(null, { tabId, frameId })
    const timeStamp = Date.now()
    const details = { ...frame, tabId, timeStamp }
    this.emit('onDOMContentLoaded', details)
  }

  async dispatchOnCompleted (webContents, event, { frameRoutingId: frameId }) {
    const tabId = webContents.id
    const frame = await this.getFrame(null, { tabId, frameId })
    const timeStamp = Date.now()
    const details = { ...frame, tabId, timeStamp }
    this.emit('onCompleted', details)
  }

  async dispatchOnErrorOccured (webContents, event, { url, frameRoutingId: frameId }, { code, description }) {
    const tabId = webContents.id
    const frame = await this.getFrame(null, { tabId, frameId })
    const timeStamp = Date.now()
    const error = `${code}: ${description}`
    const details = { ...frame, url, tabId, timeStamp, error }
    this.emit('onErrorOccured', details)
  }
}

class ContextMenus extends EventEmtiter {
  constructor ({ tabs }) {
    super()
    this.tabs = tabs
    /*
      Map extension IDs to Maps of context menu item IDs to context Menu Items
      [extensionId]: {
        [menuItemId] {
          extensionId,
          id,
          title,
          type: "normal" | "separator",
          visible: true,
          enabled: true,
          contexts: ["all", "page", "frame", "selection", "link", "editable", "image", "video", "audio", "browser_action"]
        }
      }

    */
    this.items = new Map()
  }

  /* Invoked by application */
  getForEvent (webContents, event, params, { isBrowserAction = false, isLauncher = false } = {}) {
    const {
      linkURL,
      srcURL,
      pageURL,
      frame,
      frameURL,
      mediaType,
      isEditable,
      selectionText,
      inputFieldType
    } = params

    let context = 'page'

    if (isLauncher) context = 'launcher'
    else if (isBrowserAction) context = 'browser_action'
    else if (inputFieldType === 'password') context = 'password'
    else if (mediaType === 'image' || mediaType === 'canvas') context = 'image'
    else if (mediaType === 'video') context = 'video'
    else if (mediaType === 'audio') context = 'audio'
    else if (selectionText) context = 'selection'
    else if (isEditable) context = 'editable'
    else if (linkURL) context = 'link'

    const items = this.getForContext(context)

    const onClickData = {
      editable: isEditable,
      frameId: frame.routingId,
      frameURL,
      linkURL,
      pageURL,
      srcURL,
      selectionText,
      mediaType
    }
    // Also add the `menuItemId` per item

    // TODO: Filter based on targetURLPatterns
    return items.map(({ extensionId, id, title, type, enabled }) => {
      return new MenuItem({
        label: title,
        type,
        enabled,
        click: () => this.click(extensionId, id, onClickData, webContents)
      })
    })
  }

  click (extensionId, menuItemId, onClickData = {}, webContents) {
    this.dispatchOnClicked(extensionId, { ...onClickData, menuItemId }, webContents)
  }

  getForContext (context) {
    return [...this].filter(({ visible, contexts }) => {
      // TODO: Handle Document URL Patterns
      if (visible === false) return false
      if (contexts.includes('all')) return true
      return contexts.includes(context)
    })
  }

  * [Symbol.iterator] () {
    const extensionMaps = this.items.values()
    for (const items of extensionMaps) {
      yield * items.values()
    }
  }

  /* Invoked by extension APIs */
  async create (extensionId, createProperties = {}) {
    const {
      id,
      type = 'normal',
      title = id,
      contexts = ['page'],
      enabled = true,
      visible = true
    } = createProperties

    const menuItem = {
      extensionId,
      id,
      type,
      title,
      contexts,
      enabled,
      visible
    }

    if (!this.items.has(extensionId)) {
      this.items.set(extensionId, new Map())
    }

    this.items.get(extensionId).set(id, menuItem)

    return id
  }

  async remove (extensionId, menuItemId) {
    if (!this.items.has(extensionId)) return
    this.items.get(extensionId).delete(menuItemId)
  }

  async removeAll (extensionId) {
    this.items.delete(extensionId)
  }

  async update (extensionId, menuItemId, updateProperties) {
    const {
      type,
      title,
      contexts,
      visible,
      enabled
    } = updateProperties

    if (!this.items.has(extensionId)) {
      console.warn('Tried to update non-existing extension menu item')
      return
    }
    const extensionItems = this.items.get(extensionId)

    if (extensionItems.has(menuItemId)) {
      console.warn('Tried to update non-existing extension menu item')
      return
    }

    const finalUpdates = {}
    if (type !== undefined) finalUpdates.type = type
    if (title !== undefined) finalUpdates.title = title
    if (contexts !== undefined) finalUpdates.contexts = contexts
    if (visible !== undefined) finalUpdates.visible = visible
    if (enabled !== undefined) finalUpdates.enabled = enabled

    const existing = this.items.get(extensionId).get(menuItemId)

    extensionItems.set(menuItemId, { ...existing, ...finalUpdates })
  }

  async onClicked (extensionId, handler) {
    this.on(`${extensionId}-onClicked`, handler)
    return () => this.removeListener(`${extensionId}-onClicked`, handler)
  }

  dispatchOnClicked (extensionId, onClickData, webContents) {
    const tab = webContents ? webContentsToTab(webContents) : null
    this.emit(`${extensionId}-onClicked`, onClickData, tab)
  }
}

class BrowserActions extends EventEmtiter {
  constructor ({ tabs }) {
    super()
    this.tabs = tabs
    // Map extension id to browser action
    /*
    Actions look like:

    [extensionId] : {
      extensionId: 0,
      extensionURL: `chrome-extension://whatever`
      enabled: true,
      title: "Hello World",
      popup: "hello" or null,
      badge: "0" or "",
      icon: `chrome-extension://whatever/whatever.png`

      tabs: {
        [tabId]: {
        [property]: newValue
      }
    }

    */
    this.actions = new Map()
  }

  registerExtension ({ id, manifest, url, path }) {
    if (!manifest.browser_action) return
    const manifestData = manifest.browser_action

    const extensionURL = url
    const extensionId = id
    const icon = actionIcon(path, manifestData.default_icon)
    const title = manifestData.default_title
    const popup = manifestData.default_popup

    this.actions.set(extensionId, {
      extensionId,
      extensionURL,
      enabled: true,
      title,
      popup,
      badge: '',
      icon,
      tabs: {}
    })
  }

  unregisterExtension (extensionId) {
    this.actions.delete(extensionId)
    this.dispatchOnChange()
  }

  async click (extensionId, tabId) {
    const action = await this.get(extensionId, tabId)
    if (action.popup) {
      return this.openPopup(extensionId, { tabId })
    } else {
      return this.dispatchOnClicked(extensionId, tabId)
    }
  }

  get (extensionId, tabId) {
    const action = this.actions.get(extensionId)
    if (tabId && action.tabs[tabId]) {
      const updates = action.tabs[tabId]
      const updated = { ...action, ...updates }
      return updated
    } else {
      // Don't return mutable references
      return { ...action }
    }
  }

  getProperty (extensionId, property, tabId) {
    const action = this.get(extensionId, tabId)
    if (action) return action[property]
  }

  list (tabId) {
    return [...this.actions.entries()]
      .map(([extensionId, action]) => {
        const combined = { ...action, extensionId }
        if (tabId && action.tabs[tabId]) {
          const updates = action.tabs[tabId]
          return { ...combined, ...updates }
        } else {
          return combined
        }
      })
  }

  update (extensionId, updates, tabId) {
    const action = this.get(extensionId)
    if (tabId) {
      const existing = action.tabs[tabId] || {}
      const updated = { ...existing, ...updates }
      action.tabs[tabId] = updated
      this.dispatchOnChangeTab(tabId)
    } else {
      const updated = { ...action, ...updates }
      this.actions.set(extensionId, updated)
      this.dispatchOnChange()
    }
  }

  async getTitle (extensionId, { tabId } = {}) {
    return this.getProperty(extensionId, 'title', tabId)
  }

  async setTitle (extensionId, { title, tabId } = {}) {
    return this.update(extensionId, { title }, tabId)
  }

  async setIcon (extensionId, { imageData, path, tabId } = {}) {
    const extensionURL = await this.getProperty(extensionId, 'extensionURL', tabId)
    const icon = actionIcon(extensionURL, path || imageData)
    return this.update(extensionId, { icon }, tabId)
  }

  async getPopup (extensionId, { tabId } = {}) {
    return this.getProperty(extensionId, 'popup', tabId)
  }

  async setPopup (extensionId, { popup, tabId } = {}) {
    return this.update(extensionId, { popup }, tabId)
  }

  async openPopup (extensionId, { tabId } = {}) {
    const action = this.get(extensionId, tabId)
    const { popup, extensionURL } = action

    await this.tabs.create(extensionId, {
      url: new URL(popup, extensionURL).href,
      popup: true,
      openerTabId: tabId
    })
  }

  async getBadgeText (extensionId, { tabId } = {}) {
    return this.getProperty(extensionId, 'badge', tabId)
  }

  async setBadgeText (extensionId, { text, tabId } = {}) {
    return this.update(extensionId, { badge: text }, tabId)
  }

  async disable (extensionId, { tabId } = {}) {
    return this.update(extensionId, { enabled: false }, tabId)
  }

  async enable (extensionId, { tabId } = {}) {
    return this.update(extensionId, { enabled: true }, tabId)
  }

  async isEnabled (extensionId, { tabId } = {}) {
    return this.getProperty(extensionId, 'enabled', tabId)
  }

  async onClicked (extensionId, handler) {
    this.on(`${extensionId}-onClicked`, handler)
    return () => this.removeListener(`${extensionId}-onClicked`, handler)
  }

  dispatchOnChange () {
    this.emit('change', this.list())
  }

  dispatchOnChangeTab (tabId) {
    this.emit('change-tab', this.list(tabId))
  }

  async dispatchOnClicked (extensionId, tabId) {
    const tab = await this.tabs.get(extensionId, tabId)
    this.emit(`${extensionId}-onClicked`, tab)
  }
}

class Debugger extends EventEmtiter {
  constructor ({ tabs, session }) {
    super()
    this.tabs = tabs
    this.session = session
  }

  async attach (extensionId, target, requiredVersion = '1.1') {
    // This will throw if it's not a tracked tab
    const webContents = await this.tabs.getRaw(target)

    const onDetach = (event, reason) => {
      this.dispatchOnDetach(extensionId, target, reason)
    }
    const onEvent = (event, method, ...args) => {
      this.dispatchOnEvent(extensionId, target, method, ...args)
    }

    webContents.debugger.on('detach', onDetach)
    webContents.debugger.on('message', onEvent)

    webContents.debugger.attach(requiredVersion)

    const cleanup = () => {
      webContents.debugger.removeListener('detach', onDetach)
      webContents.debugger.removeListener('message', onEvent)
    }

    webContents.debugger.once('detach', cleanup)
  }

  async detach (extensionId, target) {
    // This will throw if it's not a tracked tab
    const webContents = await this.tabs.getRaw(target)

    webContents.debugger.detach()
  }

  async getTargets (extensionId) {
    return [...this.tabs].map((webContents) => {
      const attached = webContents.debugger.isAttached()
      const tabId = webContents.id
      const id = tabId
      const type = 'page'
      const title = webContents.getTitle()
      const url = webContents.getURL()

      return { attached, tabId, id, type, title, url }
    })
  }

  async sendCommand (extensionId, target, method, ...args) {
    const webContents = await this.tabs.getRaw(target)

    return webContents.debugger.sendCommand(method, ...args)
  }

  onAttach (extensionId, handler) {
    this.on(`${extensionId}-onAttach`, handler)
    return () => this.removeListener(`${extensionId}-onAttach`, handler)
  }

  onDetach (extensionId, handler) {
    this.on(`${extensionId}-onDetach`, handler)
    return () => this.removeListener(`${extensionId}-onDetach`, handler)
  }

  async dispatchOnDetach (extensionId, target, reason) {
    this.emit(`${extensionId}-onDetach`, target, reason)
  }

  async dispatchOnEvent (extensionId, target, method, ...args) {
    this.emit(`${extensionId}-onEvent`, target, method, ...args)
  }
}

class Tabs extends EventEmtiter {
  constructor (extensions) {
    super()
    this.tabs = new Map()
    this.extensions = extensions
  }

  /* Invoked by application */
  async trackTab (webContents) {
    this.tabs.set(webContents.id, webContents)

    webContents.on('destroyed', () => this.dispatchOnRemoved(webContents))
    webContents.on('focus', () => this.dispatchOnActivated(webContents))
    webContents.on('did-start-navigation', (e, url, isInPlace, isMainFrame) => {
      // Only listen for navigation changes in the main frame
      if (!isMainFrame && isInPlace) return
      this.dispatchOnUpdated(webContents)
    })
    this.dispatchOnCreated(webContents)
  }

  /* Invoked by extension APIs */
  async create (extensionId, options = {}) {
    // TODO: check permissions for extension ID
    const webContents = await this.extensions.onCreateTab(options)
    this.trackTab(webContents)
    return webContentsToTab(webContents)
  }

  async executeScript (extensionId, tabId, { code, allFrames = false, frameId, file } = {}) {
    if (file) throw new Error('File injection not supported')
    const webContents = await this.getRaw(tabId)
    if (allFrames && frameId) throw new Error('allFrames and frameId are mutually exclusive')
    if (allFrames) {
      return Promise.all(webContents.mainFrame.framesInSubtree.map((frame) => {
        return frame.executeJavaScript(code)
      }))
    } else if (frameId) {
      for (const frame of webContents.mainFrame.framesInSubtree) {
        if (frame.routingId !== frameId) continue
        return frame.executeJavaScript(code)
      }
    } else {
      return webContents.mainFrame.executeJavaScript(code)
    }
  }

  async getRaw (tabId) {
    if (!this.tabs.has(tabId)) throw new Error('Tab Not Found')
    return this.tabs.get(tabId)
  }

  async get (extensionId, tabId) {
    const webContents = await this.getRaw(tabId)
    return webContentsToTab(webContents)
  }

  async query (extensionId, query) {
    return [...this.tabs.values()].filter((webContents) => {
      const tab = webContentsToTab(webContents)
      // TODO: Suppor match patterns for tab URLs
      // Use this for pattern matching: https://github.com/kong0107/url-match-pattern
      for (const key of TAB_QUERY_PROPERTIES) {
        if (key in query && tab[key] !== query[key]) return false
      }
      return true
    })
  }

  async remove (extensionId, tabIds) {
    for (const tabId of [].concat(tabIds)) {
      if (!this.tabs.has(tabId)) continue
      const webContents = this.tabs.get(tabId)
      webContents.destroy()
    }
  }

  async reload (extensionId, tabId) {
    if (!this.tabs.has(tabId)) throw new Error('Not Found')
    const webContents = this.tabs.get(tabId)
    webContents.reload()
  }

  [Symbol.iterator] () {
    return this.tabs.values()
  }

  onActivated (extensionId, handler) {
    this.on('onActivated', handler)
    return () => this.removeListener('onActivated', handler)
  }

  onCreated (extensionId, handler) {
    this.on('onCreated', handler)
    return () => this.removeListener('onCreated', handler)
  }

  onRemoved (extensionId, handler) {
    this.on('onRemoved', handler)
    return () => this.removeListener('onRemoved', handler)
  }

  onUpdated (extensionId, handler) {
    // TODO: Add support for filters
    this.on('onUpdated', handler)
    return () => this.removeListener('onUpdated')
  }

  async dispatchOnActivated ({ id: tabId }) {
    this.emit('onActivated', { tabId })
  }

  async dispatchOnCreated (webContents) {
    const tab = webContentsToTab(webContents)
    this.emit('onCreated', tab)
    this.emit('created', webContents)
  }

  async dispatchOnRemoved ({ id: tabId }) {
    this.emit('onRemoved', { tabId, removeInfo: {} })
  }

  dispatchOnUpdated (webContents, property = 'url') {
    // Only URL changes supported for now
    const tabId = webContents.id
    const tab = webContentsToTab(webContents)
    const changeInfo = {}
    if (property === 'url') {
      changeInfo.url = webContents.getURL()
    }
    this.emit('onUpdated', tabId, changeInfo, tab)
  }
}

async function DEFAULT_ON_CREATE_TAB (options) {
  throw new Error('Unable to create tabs, not implemented')
}

class ExtendedExtensions {
  constructor (session, {
    onCreateTab = DEFAULT_ON_CREATE_TAB,
    preloadPath = PRELOAD_PATH
  } = {}) {
    this.onDestroy = []
    this.extensions = new Map()

    // Register the session related callbacks?
    this.session = session

    if (onCreateTab === DEFAULT_ON_CREATE_TAB) {
      console.warn('ExtendedExtensions: onCreateTab was not supplied, some extension features will be unavailable')
    }

    this.onCreateTab = onCreateTab

    const preloads = session.getPreloads()
    session.setPreloads([...preloads, preloadPath])

    this.tabs = new Tabs(this)
    this.debugger = new Debugger(this)
    this.browserActions = new BrowserActions(this)
    this.contextMenus = new ContextMenus(this)
    this.webNavigation = new WebNavigation(this)

    this.attachAPI(this.tabs, 'tabs')
    this.attachAPI(this.debugger, 'debugger')
    this.attachAPI(this.browserActions, 'browserAction')
    this.attachAPI(this.contextMenus, 'contextMenus')
    this.attachAPI(this.webNavigation, 'webNavigation')

    const handleContentsCreated = (event, webContents) => {
      if (webContents.session !== this.session) return
      this.tabs.trackTab(webContents)
    }

    app.on('web-contents-created', handleContentsCreated)
    this.onDestroy.push(() => {
      app.removeListener('web-contents-created', handleContentsCreated)
    })
  }

  async loadExtension (extensionPath) {
    const extension = await this.session.loadExtension(extensionPath)
    const { id } = extension

    this.extensions.set(id, extension)

    this.browserActions.registerExtension(extension)

    return extension
  }

  async get (id) {
    if (!this.extensions.has(id)) throw new Error('Extension not registered')
    return this.extensions.get(id)
  }

  async unloadExtension (id) {
    if (!this.extensions.has(id)) return

    this.browserActions.unregisterExtension(id)

    await this.session.unloadExtension(id)
    this.extensions.delete(id)
  }

  async getBackgroundPage (id) {
    // iterate through web contents
    // Filter for web contents that are:
    // - The URL of the background page for the extension
    // - The session this extension was registered for
    // - It is the background page?
    const extension = await this.get(id)
    return WebContents.getAllWebContents().find((webContents) => {
      const url = webContents.getURL()
      if (webContents.session !== this.session) return false
      if (!url.startsWith(extension.url)) return false
      // TODO: How do we know if it's the background page?
      // Likely the background page will be created before any other extension pages?
      return true
    })
  }

  attachAPI (implementation, type) {
    for (const [name, apiKind] of Object.entries(spec[type])) {
      if (apiKind === FUNCTION) {
        this.attachFunctionAPI(implementation, type, name)
      } else if (apiKind === EVENT) {
        this.attachListenerAPI(implementation, type, name)
      } else {
        throw new TypeError(`Invalid API Kind: ${apiKind}`)
      }
    }
  }

  attachListenerAPI (implementation, type, name) {
    const event = makeEvent(type, name)
    const listeners = new Map()

    const onAdd = async (e, extensionId, listenerId) => {
      const { frameId, sender } = e
      if (sender.session !== this.session) return
      // TODO: Check if extension has permission for this page URL
      const key = `${frameId}-${extensionId}-${listenerId}`

      function handler (...args) {
        e.reply(event, extensionId, listenerId, ...args)
      }

      const removeListener = await implementation[name](extensionId, handler)
      listeners.set(key, cleanup)

      sender.once('did-navigate', navigateListener)

      function navigateListener () {
        cleanup()
        sender.removeListener('did-navigate', navigateListener)
      }

      function cleanup () {
        removeListener()
        listeners.delete(key)
      }
    }

    const onRemove = (e, extensionId, listenerId) => {
      const { frameId, sender } = e
      // Only respond to sessions we're listening on
      if (sender.session !== this.session) return
      const key = `${frameId}-${extensionId}-${listenerId}`
      const cleanup = listeners.get(key)
      if (!cleanup) return
      cleanup()
    }

    const listenEvent = event + '-add'
    const removeEvent = event + '-remove'

    ipcMain.on(listenEvent, onAdd)
    ipcMain.on(removeEvent, onRemove)

    this.onDestroy.push(() => {
      for (const cleanup of listeners.values()) {
        cleanup()
      }
      ipcMain.removeListener(listenEvent, onAdd)
      ipcMain.removeListener(removeEvent, onRemove)
    })
  }

  attachFunctionAPI (implementation, type, name) {
    const event = makeEvent(type, name)
    const onInvoke = async (e, extensionId, ...args) => {
      const { sender } = e
      // Only respond to sessions we're listening on
      if (sender.session !== this.session) return
      return implementation[name](extensionId, ...args)
    }
    // TODO: Register handlers globally and have extensions instances attach/detach from there
    ipcMain.handle(event, onInvoke)

    this.onDestroy.push(() => {
      ipcMain.removeHandler(event, onInvoke)
    })
  }

  async destroy () {
    for (const id of this.extensions.keys()) {
      await this.unloadExtension(id)
    }
    for (const onDestroy of this.onDestroy) {
      await onDestroy()
    }
  }
}

function webContentsToTab (webContents) {
  const active = webContents.isFocused()
  const id = webContents.id
  const status = webContents.isLoading() ? 'complete' : 'loading'
  const url = webContents.getURL()
  const title = webContents.getTitle()

  return {
    active,
    id,
    status,
    title,
    url
  }
}

function actionIcon (extensionPath, iconMapOrPath) {
  const type = typeof iconMapOrPath
  if (type === 'string') {
    return join(extensionPath, iconMapOrPath)
  } else if (type === 'object') {
    const imageKey = Object.keys(iconMapOrPath).sort().at(-1)
    const imagePath = iconMapOrPath[imageKey]
    return join(extensionPath, imagePath)
  }
  return ''
}

module.exports = {
  ExtendedExtensions,
  Tabs
}
