import {
  extractAmazonProductData,
  isSupportedAmazonProductPage,
  type AmazonProductData
} from './amazonProduct';
const REQUEST_TYPE = 'pinch:get-product-data';
const RESPONSE_TYPE = 'pinch:product-data';

declare global {
  interface Window {
    __PINCH_AMAZON_PRODUCT_DATA__?: AmazonProductData | null;
  }
}

function getCurrentProductData(): AmazonProductData | null {
  return extractAmazonProductData(document, new URL(window.location.href));
}

function setPublishedProductData(
  productData: AmazonProductData | null
): AmazonProductData | null {
  window.__PINCH_AMAZON_PRODUCT_DATA__ = productData;
  window.dispatchEvent(
    new CustomEvent(RESPONSE_TYPE, {
      detail: productData
    })
  );

  return productData;
}

function publishProductData(): AmazonProductData | null {
  return setPublishedProductData(getCurrentProductData());
}

function initializeContentScript(): void {
  const pageUrl = new URL(window.location.href);

  if (!isSupportedAmazonProductPage(pageUrl)) {
    setPublishedProductData(null);
    return;
  }
  publishProductData();

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message?.type !== REQUEST_TYPE) {
      return undefined;
    }

    sendResponse({
      type: RESPONSE_TYPE,
      payload: publishProductData()
    });

    return false;
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentScript, {
    once: true
  });
} else {
  initializeContentScript();
}
