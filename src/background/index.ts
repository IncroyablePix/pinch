const browserTarget = __BROWSER_TARGET__ === 'firefox' ? 'Firefox' : 'Chromium';

chrome.runtime.onInstalled.addListener(() => {
  console.info(`Pinch extension installed for ${browserTarget}.`);
});
