import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AmazonProductData } from '../src/shared/amazon';
import { lookupAmazonMarketplacePrices } from '../src/popup/amazonLookup';

const sourceProduct: AmazonProductData = {
  asin: 'B0UKLOOK01',
  title: 'Ultra Widget Travel Mug',
  priceValue: 24.99,
  currency: 'USD',
  locale: 'en-US',
  host: 'www.amazon.com',
  url: 'https://www.amazon.com/dp/B0UKLOOK01'
};

function readFixture(name: string): string {
  return readFileSync(
    new URL(`./fixtures/amazon/${name}`, import.meta.url),
    'utf8'
  );
}

function createDomParser(): DOMParser {
  return {
    parseFromString(html: string): Document {
      return new JSDOM(html).window.document;
    }
  } as DOMParser;
}

function createHtmlResponse(
  body: string,
  url: string
): Pick<Response, 'ok' | 'status' | 'headers' | 'text' | 'url'> {
  return {
    ok: true,
    status: 200,
    url,
    headers: new Headers({
      'content-type': 'text/html; charset=utf-8'
    }),
    async text() {
      return body;
    }
  };
}

function createMissingHtmlResponse(): Pick<
  Response,
  'ok' | 'status' | 'headers' | 'text' | 'url'
> {
  return {
    ok: false,
    status: 404,
    url: '',
    headers: new Headers({
      'content-type': 'text/html; charset=utf-8'
    }),
    async text() {
      return '';
    }
  };
}

describe('lookupAmazonMarketplacePrices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('returns alternate marketplace prices from direct and search fallbacks', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();

      if (url === 'https://www.amazon.co.uk/dp/B0UKLOOK01') {
        return createHtmlResponse(
          readFixture('uk-direct-product.html'),
          url
        ) as Response;
      }

      if (
        url.startsWith('https://www.amazon.de/dp/') ||
        url.startsWith('https://www.amazon.de/gp/product/') ||
        url.startsWith('https://www.amazon.de/gp/aw/d/')
      ) {
        throw new TypeError('Failed to fetch');
      }

      if (
        url.startsWith('https://www.amazon.fr/dp/') ||
        url.startsWith('https://www.amazon.fr/gp/product/') ||
        url.startsWith('https://www.amazon.fr/gp/aw/d/')
      ) {
        throw new TypeError('Failed to fetch');
      }

      if (url === 'https://www.amazon.de/s?k=Ultra%20Widget%20Travel%20Mug') {
        return createHtmlResponse(
          readFixture('de-search-results.html'),
          url
        ) as Response;
      }

      if (
        url ===
        'https://www.amazon.de/s?k=Ultra%20Widget%20Travel%20Mug&i=mobile-apps'
      ) {
        return createHtmlResponse(
          readFixture('de-search-results.html'),
          url
        ) as Response;
      }

      if (url === 'https://www.amazon.fr/s?k=Ultra%20Widget%20Travel%20Mug') {
        return createHtmlResponse(
          readFixture('fr-search-results.html'),
          url
        ) as Response;
      }

      if (
        url ===
        'https://www.amazon.fr/s?k=Ultra%20Widget%20Travel%20Mug&i=mobile-apps'
      ) {
        return createHtmlResponse(
          readFixture('fr-search-results.html'),
          url
        ) as Response;
      }

      return createMissingHtmlResponse() as Response;
    });

    const results = await lookupAmazonMarketplacePrices(sourceProduct, {
      dependencies: {
        fetch: fetchMock as typeof fetch,
        domParser: createDomParser(),
        wait: async () => undefined
      }
    });

    expect(results).toEqual([
      {
        domain: 'www.amazon.co.uk',
        url: 'https://www.amazon.co.uk/dp/B0UKLOOK01',
        price: 29.99,
        currency: 'GBP',
        foundBy: 'direct-asin'
      },
      {
        domain: 'www.amazon.de',
        url: 'https://www.amazon.de/dp/B0DESRCH02',
        price: 34.95,
        currency: 'EUR',
        foundBy: 'search-title-match'
      }
    ]);
    expect(fetchMock).toHaveBeenCalled();
  });

  it('retries direct fetches across request profiles before search fallback', async () => {
    const attemptedUrls: string[] = [];
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = typeof input === 'string' ? input : input.toString();
      attemptedUrls.push(url);

      if (url === 'https://www.amazon.co.uk/gp/aw/d/B0UKLOOK01') {
        return createHtmlResponse(
          readFixture('uk-direct-product.html'),
          url
        ) as Response;
      }

      return createMissingHtmlResponse() as Response;
    });

    const results = await lookupAmazonMarketplacePrices(sourceProduct, {
      dependencies: {
        fetch: fetchMock as typeof fetch,
        domParser: createDomParser(),
        wait: async () => undefined
      }
    });

    const coUkUrls = attemptedUrls.filter((url) =>
      url.startsWith('https://www.amazon.co.uk/')
    );

    expect(coUkUrls).toContain('https://www.amazon.co.uk/dp/B0UKLOOK01');
    expect(coUkUrls).toContain(
      'https://www.amazon.co.uk/gp/product/B0UKLOOK01?psc=1'
    );
    expect(coUkUrls).toContain('https://www.amazon.co.uk/gp/aw/d/B0UKLOOK01');
    expect(
      coUkUrls.indexOf('https://www.amazon.co.uk/dp/B0UKLOOK01')
    ).toBeLessThan(
      coUkUrls.indexOf('https://www.amazon.co.uk/gp/product/B0UKLOOK01?psc=1')
    );
    expect(
      coUkUrls.indexOf('https://www.amazon.co.uk/gp/product/B0UKLOOK01?psc=1')
    ).toBeLessThan(
      coUkUrls.indexOf('https://www.amazon.co.uk/gp/aw/d/B0UKLOOK01')
    );
    expect(results[0]).toMatchObject({
      domain: 'www.amazon.co.uk',
      foundBy: 'direct-asin'
    });
  });
});
