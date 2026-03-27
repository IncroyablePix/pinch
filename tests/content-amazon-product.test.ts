import { JSDOM } from 'jsdom';
import { describe, expect, it } from 'vitest';
import {
  extractAmazonProductData,
  isSupportedAmazonProductPage
} from '../src/content/amazonProduct';

function createDocument(html: string): Document {
  return new JSDOM(html).window.document;
}

describe('Amazon product extraction', () => {
  it('detects supported Amazon product URLs', () => {
    expect(
      isSupportedAmazonProductPage(
        new URL('https://www.amazon.com/dp/B012345678')
      )
    ).toBe(true);
    expect(
      isSupportedAmazonProductPage(
        new URL('https://www.amazon.co.uk/gp/product/B012345678?psc=1')
      )
    ).toBe(true);
    expect(
      isSupportedAmazonProductPage(
        new URL(
          'https://www.amazon.de/gp/aw/d/B012345678/ref=ox_sc_act_title_1'
        )
      )
    ).toBe(true);
    expect(
      isSupportedAmazonProductPage(
        new URL('https://www.amazon.fr/s?k=headphones')
      )
    ).toBe(false);
    expect(
      isSupportedAmazonProductPage(
        new URL('https://www.example.com/dp/B012345678')
      )
    ).toBe(false);
  });

  it('extracts asin, title, usd price and locale from a US product page', () => {
    const documentNode = createDocument(`
      <html>
        <head>
          <title>Ignored title</title>
          <link rel="canonical" href="https://www.amazon.com/dp/B012345678/" />
        </head>
        <body>
          <span id="productTitle">  Ultra Widget  </span>
          <div id="corePrice_feature_div">
            <span class="a-offscreen">$1,299.99</span>
          </div>
        </body>
      </html>
    `);

    expect(
      extractAmazonProductData(
        documentNode,
        new URL('https://www.amazon.com/dp/B012345678?th=1')
      )
    ).toEqual({
      asin: 'B012345678',
      title: 'Ultra Widget',
      priceValue: 1299.99,
      currency: 'USD',
      locale: 'en-US'
    });
  });

  it('prefers primary buybox pricing over later fallback prices', () => {
    const documentNode = createDocument(`
      <html>
        <body>
          <input id="ASIN" value="B0UKTEST01" />
          <span id="productTitle">Tea Kettle</span>
          <span class="a-price">
            <span class="a-offscreen">£39.99</span>
          </span>
          <span id="priceblock_ourprice">£29.50</span>
        </body>
      </html>
    `);

    expect(
      extractAmazonProductData(
        documentNode,
        new URL('https://www.amazon.co.uk/gp/product/B0UKTEST01')
      )
    ).toEqual({
      asin: 'B0UKTEST01',
      title: 'Tea Kettle',
      priceValue: 29.5,
      currency: 'GBP',
      locale: 'en-GB'
    });
  });

  it('falls back to canonical asin and euro meta pricing when primary selectors are absent', () => {
    const documentNode = createDocument(`
      <html>
        <head>
          <meta property="og:title" content="Kaffeemühle" />
          <meta property="product:price:amount" content="129,95 €" />
          <link rel="canonical" href="https://www.amazon.de/gp/product/B0DETEST01" />
        </head>
        <body></body>
      </html>
    `);

    expect(
      extractAmazonProductData(
        documentNode,
        new URL('https://www.amazon.de/gp/product/B0DETEST01')
      )
    ).toEqual({
      asin: 'B0DETEST01',
      title: 'Kaffeemühle',
      priceValue: 129.95,
      currency: 'EUR',
      locale: 'de-DE'
    });
  });

  it('extracts mobile-path products and defaults currency from marketplace when symbol is absent', () => {
    const documentNode = createDocument(`
      <html>
        <body>
          <div data-asin="B0FRTEST01"></div>
          <span id="title">Lampe de bureau</span>
          <meta itemprop="price" content="49,90" />
        </body>
      </html>
    `);

    expect(
      extractAmazonProductData(
        documentNode,
        new URL('https://www.amazon.fr/gp/aw/d/B0FRTEST01')
      )
    ).toEqual({
      asin: 'B0FRTEST01',
      title: 'Lampe de bureau',
      priceValue: 49.9,
      currency: 'EUR',
      locale: 'fr-FR'
    });
  });

  it('returns null when required product data is incomplete', () => {
    const documentNode = createDocument(`
      <html>
        <body>
          <span id="productTitle">Mystery Product</span>
        </body>
      </html>
    `);

    expect(
      extractAmazonProductData(
        documentNode,
        new URL('https://www.amazon.com/dp/B012345678')
      )
    ).toBeNull();
  });
});
