export interface AmazonProductData {
  asin: string;
  title: string;
  priceValue: number;
  currency: string;
  locale: string;
}

export interface AmazonMarketplace {
  host: string;
  locale: string;
  currency: string;
}

const AMAZON_MARKETPLACES: AmazonMarketplace[] = [
  { host: 'www.amazon.com', locale: 'en-US', currency: 'USD' },
  { host: 'www.amazon.co.uk', locale: 'en-GB', currency: 'GBP' },
  { host: 'www.amazon.de', locale: 'de-DE', currency: 'EUR' },
  { host: 'www.amazon.fr', locale: 'fr-FR', currency: 'EUR' }
];

const PRODUCT_PATH_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i
];

const TITLE_SELECTORS = [
  '#productTitle',
  '#title',
  'meta[property="og:title"]',
  'meta[name="title"]',
  'title'
];

const PRIMARY_PRICE_SELECTORS = [
  '#corePrice_feature_div .a-offscreen',
  '#corePriceDisplay_desktop_feature_div .a-offscreen',
  '#corePriceDisplay_mobile_feature_div .a-offscreen',
  '#apex_desktop .a-offscreen',
  '#apex_mobile .a-offscreen',
  '#price_inside_buybox',
  '#newBuyBoxPrice',
  '#tp_price_block_total_price_ww .a-offscreen',
  '#priceblock_dealprice',
  '#priceblock_saleprice',
  '#priceblock_ourprice',
  '#priceToPay .a-offscreen',
  '.priceToPay .a-offscreen',
  '.apexPriceToPay .a-offscreen',
  '.reinventPricePriceToPayMargin .a-offscreen',
  '[data-a-color="price"] .a-offscreen'
];

const FALLBACK_PRICE_SELECTORS = [
  '.a-price.aok-align-center .a-offscreen',
  '.a-price .a-offscreen',
  '.a-price-whole',
  '[data-asin-price]',
  'span[data-csa-c-type="widget"] .a-offscreen',
  'meta[property="product:price:amount"]',
  'meta[property="og:price:amount"]',
  'meta[itemprop="price"]'
];

const ASIN_SELECTORS = ['#ASIN', 'input[name="ASIN"]', '[data-asin]'];

const CURRENCY_BY_SYMBOL: Record<string, string> = {
  $: 'USD',
  '£': 'GBP',
  '€': 'EUR'
};

const CURRENCY_PATTERN = /(USD|GBP|EUR|\$|£|€)/i;
const PRICE_TOKEN_PATTERN =
  /(USD|GBP|EUR|\$|£|€)\s*[\d.,\s]+|[\d.,\s]+\s*(USD|GBP|EUR|\$|£|€)/i;

function normalizeText(value: string | null | undefined): string {
  return value?.replace(/\s+/g, ' ').trim() ?? '';
}

function uniqueByText(elements: Element[]): Element[] {
  const seen = new Set<string>();

  return elements.filter((element) => {
    const key = [
      element.tagName,
      normalizeText(element.textContent),
      normalizeText(element.getAttribute('content')),
      normalizeText(element.getAttribute('value'))
    ].join(':');

    if (seen.has(key)) {
      return false;
    }

    seen.add(key);
    return true;
  });
}

function collectElements(
  documentNode: Document,
  selectors: string[]
): Element[] {
  const matches = selectors.flatMap((selector) =>
    Array.from(documentNode.querySelectorAll(selector))
  );

  return uniqueByText(matches);
}

function resolveMarketplace(pageUrl: URL): AmazonMarketplace | null {
  return (
    AMAZON_MARKETPLACES.find(
      (marketplace) => marketplace.host === pageUrl.hostname
    ) ?? null
  );
}

function hasSupportedProductPath(pathname: string): boolean {
  return PRODUCT_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isSupportedAmazonProductPage(pageUrl: URL): boolean {
  return (
    resolveMarketplace(pageUrl) !== null &&
    hasSupportedProductPath(pageUrl.pathname)
  );
}

function extractAsinFromPath(pathname: string): string | null {
  for (const pattern of PRODUCT_PATH_PATTERNS) {
    const match = pathname.match(pattern);

    if (match?.[1]) {
      return match[1].toUpperCase();
    }
  }

  return null;
}

function extractAsinFromCanonical(documentNode: Document): string | null {
  const canonicalHref = documentNode
    .querySelector<HTMLLinkElement>('link[rel="canonical"]')
    ?.getAttribute('href');

  if (!canonicalHref) {
    return null;
  }

  try {
    return extractAsinFromPath(
      new URL(canonicalHref, 'https://www.amazon.com').pathname
    );
  } catch {
    return extractAsinFromPath(canonicalHref);
  }
}

function extractAsinFromDom(documentNode: Document): string | null {
  for (const selector of ASIN_SELECTORS) {
    const element = documentNode.querySelector<HTMLElement>(selector);

    if (!element) {
      continue;
    }

    const asinCandidate =
      element.getAttribute('value') ??
      element.getAttribute('content') ??
      element.getAttribute('data-asin') ??
      element.textContent;

    const normalized = normalizeText(asinCandidate).match(/[A-Z0-9]{10}/i)?.[0];

    if (normalized) {
      return normalized.toUpperCase();
    }
  }

  return null;
}

function extractAsin(documentNode: Document, pageUrl: URL): string | null {
  return (
    extractAsinFromPath(pageUrl.pathname) ??
    extractAsinFromCanonical(documentNode) ??
    extractAsinFromDom(documentNode)
  );
}

function extractTitle(documentNode: Document): string | null {
  for (const selector of TITLE_SELECTORS) {
    const element = documentNode.querySelector(selector);

    if (!element) {
      continue;
    }

    const titleCandidate =
      element.getAttribute('content') ??
      element.textContent ??
      documentNode.title;
    const normalizedTitle = normalizeText(titleCandidate);

    if (normalizedTitle) {
      return normalizedTitle;
    }
  }

  return null;
}

function resolveCurrency(rawPrice: string, fallbackCurrency: string): string {
  const currencyToken = rawPrice.match(CURRENCY_PATTERN)?.[0]?.toUpperCase();

  if (!currencyToken) {
    return fallbackCurrency;
  }

  return CURRENCY_BY_SYMBOL[currencyToken] ?? currencyToken;
}

function parseNumericPrice(rawPrice: string): number | null {
  const token = rawPrice.match(/[\d][\d\s.,]*/)?.[0];

  if (!token) {
    return null;
  }

  let normalized = token.replace(/\s+/g, '');
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');

  if (lastComma !== -1 && lastDot !== -1) {
    if (lastComma > lastDot) {
      normalized = normalized.replace(/\./g, '').replace(',', '.');
    } else {
      normalized = normalized.replace(/,/g, '');
    }
  } else if (lastComma !== -1) {
    const decimalDigits = normalized.length - lastComma - 1;
    normalized =
      decimalDigits > 0 && decimalDigits <= 2
        ? normalized.replace(/\./g, '').replace(',', '.')
        : normalized.replace(/,/g, '');
  } else if (lastDot !== -1) {
    const decimalDigits = normalized.length - lastDot - 1;
    if (decimalDigits > 2) {
      normalized = normalized.replace(/\./g, '');
    }
  }

  const numericValue = Number.parseFloat(normalized);

  return Number.isFinite(numericValue) ? numericValue : null;
}

function parsePriceCandidate(
  rawPrice: string,
  fallbackCurrency: string
): Pick<AmazonProductData, 'priceValue' | 'currency'> | null {
  const compact = normalizeText(rawPrice);

  if (!compact) {
    return null;
  }

  const matchedToken = compact.match(PRICE_TOKEN_PATTERN)?.[0] ?? compact;
  const priceValue = parseNumericPrice(matchedToken);

  if (priceValue === null) {
    return null;
  }

  return {
    priceValue,
    currency: resolveCurrency(matchedToken, fallbackCurrency)
  };
}

function extractPriceFromElements(
  elements: Element[],
  fallbackCurrency: string
): Pick<AmazonProductData, 'priceValue' | 'currency'> | null {
  for (const element of elements) {
    const candidates = [
      element.getAttribute('content'),
      element.getAttribute('value'),
      element.getAttribute('data-asin-price'),
      element.textContent
    ];

    for (const candidate of candidates) {
      const parsed = parsePriceCandidate(candidate ?? '', fallbackCurrency);

      if (parsed) {
        return parsed;
      }
    }
  }

  return null;
}

function extractPrice(
  documentNode: Document,
  fallbackCurrency: string
): Pick<AmazonProductData, 'priceValue' | 'currency'> | null {
  return (
    extractPriceFromElements(
      collectElements(documentNode, PRIMARY_PRICE_SELECTORS),
      fallbackCurrency
    ) ??
    extractPriceFromElements(
      collectElements(documentNode, FALLBACK_PRICE_SELECTORS),
      fallbackCurrency
    )
  );
}

export function extractAmazonProductData(
  documentNode: Document,
  pageUrl: URL
): AmazonProductData | null {
  const marketplace = resolveMarketplace(pageUrl);

  if (!marketplace || !hasSupportedProductPath(pageUrl.pathname)) {
    return null;
  }

  const asin = extractAsin(documentNode, pageUrl);
  const title = extractTitle(documentNode);
  const price = extractPrice(documentNode, marketplace.currency);

  if (!asin || !title || !price) {
    return null;
  }

  return {
    asin,
    title,
    priceValue: price.priceValue,
    currency: price.currency,
    locale: marketplace.locale
  };
}
