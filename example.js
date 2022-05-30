const {
  session: Session,
  app,
  protocol,
  BrowserWindow,
  Menu
} = require('electron')
const { ExtendedExtensions } = require('./')
const path = require('path')

const EXTENSION_PATH = path.join(__dirname, 'example-extension')
const PROTOCOL_SCHEME = 'example'
const PROTOCOL_PRIVILEGES = {
  standard: true,
  secure: true,
  allowServiceWorkers: true,
  supportFetchAPI: true,
  corsEnabled: true,
  stream: true
}

run()

async function run () {
  protocol.registerSchemesAsPrivileged([{
    scheme: PROTOCOL_SCHEME,
    privileges: PROTOCOL_PRIVILEGES
  }])

  await app.whenReady()

  const session = Session.fromPartition('persist:example')

  const browserPrefs = {
    webPreferences: {
      session,
      contextIsolation: true
    }
  }

  function createWindow ({ url, openerTabId }) {
    const window = new BrowserWindow(browserPrefs)

    window.loadURL(url)

    return window.webContents
  }

  session.protocol.registerStringProtocol(PROTOCOL_SCHEME, async (request, sendResponse) => {
    sendResponse({
      statusCode: 200,
      data: `<pre>Example: ${JSON.stringify(request, null, '\t')}</pre>`
    })
  })

  const extensions = new ExtendedExtensions(session, {
    onCreateTab: createWindow
  })

  extensions.browserActions.on('change', (actions) => {
    console.log('new browser action list', actions)
  })

  session.on('extension-loaded', (event, extension) => {
    console.log({ extension })
  })
  app.on('web-contents-created', (event, webContents) => {
    webContents.openDevTools()

    webContents.on('context-menu', async (event, params) => {
      const items = extensions.contextMenus.getForEvent(webContents, event, params)
      const actions = extensions.browserActions.list(webContents.id).map(({ title, extensionId }) => {
        return {
          label: title,
          click: () => {
            extensions.browserActions.click(extensionId, webContents.id)
          }
        }
      })

      const backgroundPage = await extensions.getBackgroundPage(extension.id)
      console.log({ backgroundPage })

      const allItems = [...items, { type: 'separator' }, ...actions]

      Menu.buildFromTemplate(allItems).popup()
    })
  })

  const extension = await extensions.loadExtension(EXTENSION_PATH)

  console.log(extension)

  createWindow({ url: 'https://mauve.moe' })

  // Test if we can interact with custom protocols (not yet)
  createWindow({ url: 'example://example/helloworld.html' })
}
