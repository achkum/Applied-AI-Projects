// Options page: lets the user set the compression service URL (stored in chrome.storage.local).

import { getEndpoint, setEndpoint } from "./settings";

const input = document.getElementById("url") as HTMLInputElement;
const status = document.getElementById("status") as HTMLElement;
const save = document.getElementById("save") as HTMLButtonElement;

void getEndpoint().then((url) => {
  input.value = url;
});

save.addEventListener("click", async () => {
  await setEndpoint(input.value.trim().replace(/\/+$/, ""));
  status.textContent = "Saved ✓";
  status.className = "status ok";
  setTimeout(() => {
    status.textContent = "";
  }, 2000);
});
