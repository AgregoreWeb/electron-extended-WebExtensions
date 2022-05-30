/* global chrome */
chrome.contextMenus.create({ id: 'example', title: 'Hello World!' })

chrome.contextMenus.onClicked.addListener((info, tab) => {
  console.log('Context Menu Clicked!', info, tab)
  chrome.tabs.create({ url: 'https://agregore.mauve.moe' })
})

chrome.browserAction.onClicked.addListener((tab) => {
  console.log('Browser Action Clicked!', tab)
  chrome.browserAction.setPopup({ popup: 'https://blog.mauve.moe' })
})
