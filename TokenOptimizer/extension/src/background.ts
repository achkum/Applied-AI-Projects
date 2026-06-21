// Service worker: the right-click "Optimize text" menu, and the cross-origin fetch to the
// compression service (done here, not in the content script, to avoid page CSP).

import { compressViaService } from "./service";
import { getEndpoint } from "./settings";

const MENU_ID = "cutok-optimize-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Optimize text with Cutok",
    contexts: ["selection", "editable"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "optimize-selection", text: info.selectionText ?? "" });
  }
});

// Clicking the toolbar icon opens the options page (where the service URL is set).
chrome.action.onClicked.addListener(() => {
  chrome.runtime.openOptionsPage();
});

// Compression: the content script asks the worker to call the shared model service.
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "ts-compress") {
    (async () => {
      try {
        const endpoint = await getEndpoint();
        if (!endpoint) {
          sendResponse({ ok: false, reason: "no-endpoint" });
          return;
        }
        const result = await compressViaService(endpoint, msg.text, msg.rate, msg.model);
        sendResponse({ ok: true, result });
      } catch (err) {
        sendResponse({ ok: false, reason: String(err) });
      }
    })();
    return true; // keep the message channel open for the async response
  }
  return undefined;
});
