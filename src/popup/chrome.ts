export interface ProductDataResponseMessage<TPayload> {
  type: string;
  payload: TPayload;
}

const REQUEST_TYPE = 'pinch:get-product-data';
const RESPONSE_TYPE = 'pinch:product-data';

async function queryActiveTab(): Promise<chrome.tabs.Tab | null> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
  return tabs[0] ?? null;
}

export async function requestActiveTabProductData<
  TPayload
>(): Promise<TPayload | null> {
  const tab = await queryActiveTab();

  if (typeof tab?.id !== 'number') {
    return null;
  }

  try {
    const response = (await chrome.tabs.sendMessage(tab.id, {
      type: REQUEST_TYPE
    })) as ProductDataResponseMessage<TPayload> | undefined;

    if (response?.type !== RESPONSE_TYPE) {
      return null;
    }

    return response.payload ?? null;
  } catch {
    return null;
  }
}
