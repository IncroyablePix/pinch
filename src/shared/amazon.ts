export interface AmazonProductData {
  asin: string;
  title: string;
  priceValue: number;
  currency: string;
  locale: string;
  host: string;
  url: string;
}

export interface AmazonMarketplace {
  host: string;
  locale: string;
  currency: string;
}

export const AMAZON_MARKETPLACES: AmazonMarketplace[] = [
  { host: 'www.amazon.com', locale: 'en-US', currency: 'USD' },
  { host: 'www.amazon.co.uk', locale: 'en-GB', currency: 'GBP' },
  { host: 'www.amazon.de', locale: 'de-DE', currency: 'EUR' },
  { host: 'www.amazon.fr', locale: 'fr-FR', currency: 'EUR' }
];

export const AMAZON_PRODUCT_PATH_PATTERNS = [
  /\/dp\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/product\/([A-Z0-9]{10})(?:[/?]|$)/i,
  /\/gp\/aw\/d\/([A-Z0-9]{10})(?:[/?]|$)/i
];

export function resolveMarketplace(pageUrl: URL): AmazonMarketplace | null {
  return (
    AMAZON_MARKETPLACES.find(
      (marketplace) => marketplace.host === pageUrl.hostname
    ) ?? null
  );
}

export function hasSupportedAmazonProductPath(pathname: string): boolean {
  return AMAZON_PRODUCT_PATH_PATTERNS.some((pattern) => pattern.test(pathname));
}

export function isSupportedAmazonProductPage(pageUrl: URL): boolean {
  return (
    resolveMarketplace(pageUrl) !== null &&
    hasSupportedAmazonProductPath(pageUrl.pathname)
  );
}

export function getAlternateAmazonMarketplaces(
  sourceHost: string
): AmazonMarketplace[] {
  return AMAZON_MARKETPLACES.filter(
    (marketplace) => marketplace.host !== sourceHost
  );
}
