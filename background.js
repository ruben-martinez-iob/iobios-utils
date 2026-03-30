'use strict';

const APP_URL = 'https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a?platform=desktop#appName=AppGallery-10305';

chrome.action.onClicked.addListener(() => {
  chrome.tabs.query({ url: 'https://www.appsheet.com/start/6f5178ea-4877-4f23-9749-721b993b406a*' }, (tabs) => {
    if (tabs.length > 0) {
      chrome.tabs.update(tabs[0].id, { active: true });
      chrome.windows.update(tabs[0].windowId, { focused: true });
    } else {
      chrome.tabs.create({ url: APP_URL });
    }
  });
});
