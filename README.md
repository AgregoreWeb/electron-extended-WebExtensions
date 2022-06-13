# electron-extended-WebExtensions
Extend the built-in functionality of Electron Web Extensions with additional features commonly used by browsers.

### Application APIs

Here's what you need to use in order to integrate this module

```JavaScript
const { ExtendedExtensions } = require('electron-extended-WebExtensions')

// Pass in an Electron `Session` object you wish to attach to.
// If you're not sure, use the default one `session.defaultSession`
const extensions = new ExtendedExtensions(session, {
  // Handle when the system expects a new tab to be created
  // `popup` is set to `true` when it's a popup for a browser action
  // `openerTabId` is set to the id of the parent tab (if applicable)
  // You should return an Electron WebContents instance so it can be tracked
  onCreateTab: async ({url, popup=false, openerTabId}) => WebContents,
})

// Pass an absolute path to load an extension
// This will also attach necessary injected APIs to it
const extension = await extension.loadExtension(path)

// You can unload an extension at runtime by passing it's id
await extensions.unloadExtensions(extension.id)

// Listen for context menu events and get the list of menu items to add
webContents.on('context-menu', (event, params) => {
  const extensionMenuItems = extensions.contextMenus.getForEvent(webContents, event, params)
  // You might want to add some of your own context menu items
  // Could be useful in combination with https://github.com/sindresorhus/electron-context-menu
  Menu.buildFromTemplate(extensionMenuItems).popup()
})

// When you set up browser windows, you'll likely want to render browser actions
extensions.browserActions.list()

// Extensions may set custom browser actions for a tab
// You can fetch the tab-specific actions with this:
extensions.browserActions.list(webContents.id)

// Browser Action objects look something like this:
const action = {
  // Track this to notify the system of clicks
  extensionId,
  extensionURL,
  // Disabled items aren't usually listed
  enabled: true,
  // This text is usually displayed as image alt text upon hovering
  title,
  // This is the popup URL if one exists
  // Mostly handled internally by the system
  popup,
  // This is the "badge text", it can get update periodically
  text: '0',
  // This is the icon you should render for the browser action
  icon: 'chrome-extension://idhere/image.png',
}

// When users click on the Browser Action UI, notify the system with this:
// The `webcontents.id` should be the id of the web contents that the click was performed for (the active tab)
extensions.browserActions.click(extensionId, webContents.id)
```


## TODO

Items with a question mark might not happen or are low priority

- Try to reuse the [Electron Extensions](https://www.electronjs.org/docs/latest/api/extensions/) API
- Manifestv2
- Support APIs used by [WebRecorder](https://github.com/webrecorder/archiveweb.page/search?q=chrome)
- [x] Support background pages
	- [x] Spawn background page
	- [x] Provide extension APIs to it
		- [x] Tabs
		- [x] Debugger
		- [x] Context Menu
		- [x] Browser Action
		- [x] webRequest (doesn't work on custom protocols yet, built in)
- [x] Support content scripts
	- [x] Run content scripts (doesn't work on custom protocols yet, built in)
	- [x] Provide extension APIs
		- `runtime.connect` and friends
- [ ] Support popup APIs
- [x] Support BrowserActions
	- [x] Ability to specify BrowserAction in manifest
	- [x] List browser actions from electron app, listen for triggers
	- [x] Send browser action event to background page
	- [x] Open link on browser action
	- [ ] chrome.browserAction.setBackgroundColor
- [x] contextMenu API
	- [x] create()
	- [x] update()
	- [x] remove()
	- [x] onClicked()
	- [ ] Support url patterns for filtering (todo)
- [x] webNavigation API
	- [x] onBeoreNavigate
	- [x] onCommitted
	- [x] onDOMContentLoaded
	- [x] onCompleted
	- [x] onErrorOccured
	- [x] getFrame()
	- [x] getAllFrames()
	- [ ] Support url patterns for filtering (todo)
	- historyStateUpdated/createdNavigationTarget,referenceFragment will be TODO
- [ ] Extend Tabs API:
	- [x] Built in support has sendMessage, reload, executeScript, update
	- [x] get, query, create, remove
	- [x] onActivated/onCreated/onRemoved/onUpdated
	- [x] executeScript got overrided in order to support custom protocols (for Agregore)
	- captureTab?
	- insertCSS / removeCSS?
	- getCurrent?
	- goBack/goForward?
- [x] Support [debugger API](https://developer.chrome.com/docs/extensions/reference/debugger/) needed by WebRecorder
- [ ] Support interacting with pages using [Custom Protocols Handlers](https://github.com/electron/electron/issues/23616)
- [ ] Notifications API? https://www.electronjs.org/docs/latest/api/notification
- Other APIs? Open an issue or a PR.
