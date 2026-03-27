import { afterEach, describe, expect, it, vi } from 'vitest';
import { requestActiveTabProductData } from '../src/popup/chrome';

describe('requestActiveTabProductData', () => {
  const originalChrome = globalThis.chrome;

  afterEach(() => {
    globalThis.chrome = originalChrome;
    vi.restoreAllMocks();
  });

  it('returns null when messaging the active tab fails', async () => {
    globalThis.chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 321 }]),
        sendMessage: vi
          .fn()
          .mockRejectedValue(new Error('Receiving end does not exist'))
      }
    } as typeof chrome;

    await expect(requestActiveTabProductData()).resolves.toBeNull();
  });

  it('returns the payload when the content script responds with the expected type', async () => {
    globalThis.chrome = {
      tabs: {
        query: vi.fn().mockResolvedValue([{ id: 321 }]),
        sendMessage: vi.fn().mockResolvedValue({
          type: 'pinch:product-data',
          payload: { asin: 'B012345678' }
        })
      }
    } as typeof chrome;

    await expect(
      requestActiveTabProductData<{ asin: string }>()
    ).resolves.toEqual({
      asin: 'B012345678'
    });
  });
});
