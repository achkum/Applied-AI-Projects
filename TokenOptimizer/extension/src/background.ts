// Service worker: the right-click "Optimize text" menu, and the cross-origin fetch to the
// compression service (done here, not in the content script, to avoid page CSP).

import { compressViaService } from "./service";
import { getEndpoint } from "./settings";

const MENU_ID = "token-optimizer-optimize-selection";

chrome.runtime.onInstalled.addListener(() => {
  chrome.contextMenus.create({
    id: MENU_ID,
    title: "Optimize text with Token Optimizer",
    contexts: ["selection", "editable"],
  });
});

chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID && tab?.id !== undefined) {
    chrome.tabs.sendMessage(tab.id, { type: "optimize-selection", text: info.selectionText ?? "" });
  }
});

// "High" compression: the content script asks the worker to call the shared model service.
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
