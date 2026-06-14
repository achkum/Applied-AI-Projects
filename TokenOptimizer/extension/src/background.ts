// Service worker: register the "Optimize selection" context-menu item. The actual optimization
// runs in the content script (which has the page DOM and the rule engine).

const MENU_ID = "token-saver-optimize-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Optimize text with Token Saver",
    contexts: ["selection", "editable"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "optimize-selection", text: info.selectionText ?? "" });
  }
});
