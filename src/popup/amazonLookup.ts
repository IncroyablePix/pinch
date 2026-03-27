import {
  getAlternateAmazonMarketplaces,
  resolveMarketplace,
  type AmazonProductData
} from '../shared/amazon';
import {
  extractAmazonProductData,
  extractAmazonSearchCandidates,
  type AmazonSearchCandidate
} from '../shared/amazonPageParser';

export type LookupFoundBy =
  | 'direct-asin'
  | 'direct-title-match'
  | 'search-title-match';

export interface MarketplacePriceLookupResult {
  domain: string;
  url: string;
  price: number;
  currency: string;
  foundBy: LookupFoundBy;
}

export interface MarketplaceLookupDependencies {
  fetch: typeof fetch;
  domParser: Pick<DOMParser, 'parseFromString'>;
  wait: (milliseconds: number) => Promise<void>;
}

export interface MarketplaceLookupOptions {
  sourceUrl?: URL;
  dependencies?: Partial<MarketplaceLookupDependencies>;
}

interface RequestCandidate {
  url: string;
}

interface FetchedHtmlResult {
  requestUrl: string;
  finalUrl: string;
  html: string | null;
  blockedByCors: boolean;
}

const REQUEST_RETRIES = 2;
const SEARCH_RESULT_LIMIT = 6;
const TITLE_SIMILARITY_THRESHOLD = 0.52;

function createDefaultDependencies(): MarketplaceLookupDependencies {
  const domParser = typeof DOMParser === 'undefined' ? null : new DOMParser();

  return {
    fetch: globalThis.fetch.bind(globalThis),
    domParser: domParser ?? {
      parseFromString() {
        throw new Error(
          'DOMParser is unavailable in this environment. Provide a domParser dependency.'
        );
      }
    },
    wait: (milliseconds: number) =>
      new Promise((resolve) => {
        globalThis.setTimeout(resolve, milliseconds);
      })
  };
}

function mergeDependencies(
  dependencies?: Partial<MarketplaceLookupDependencies>
): MarketplaceLookupDependencies {
  const defaults = createDefaultDependencies();

  return {
    fetch: dependencies?.fetch ?? defaults.fetch,
    domParser: dependencies?.domParser ?? defaults.domParser,
    wait: dependencies?.wait ?? defaults.wait
  };
}

function buildDirectProductCandidates(
  asin: string,
  host: string
): RequestCandidate[] {
  const encodedAsin = encodeURIComponent(asin);

  return [
    {
      url: `https://${host}/dp/${encodedAsin}`
    },
    {
      url: `https://${host}/gp/product/${encodedAsin}?psc=1`
    },
    {
      url: `https://${host}/gp/aw/d/${encodedAsin}`
    }
  ];
}

function buildSearchCandidates(
  title: string,
  host: string
): RequestCandidate[] {
  const query = encodeURIComponent(title);

  return [
    {
      url: `https://${host}/s?k=${query}`
    },
    {
      url: `https://${host}/s?k=${query}&i=mobile-apps`
    }
  ];
}

function normalizeTitle(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toWordSet(value: string): Set<string> {
  return new Set(
    normalizeTitle(value)
      .split(' ')
      .filter((token) => token.length > 1)
  );
}

function scoreTitleSimilarity(
  sourceTitle: string,
  candidateTitle: string
): number {
  const normalizedSource = normalizeTitle(sourceTitle);
  const normalizedCandidate = normalizeTitle(candidateTitle);

  if (!normalizedSource || !normalizedCandidate) {
    return 0;
  }

  if (normalizedSource === normalizedCandidate) {
    return 1;
  }

  const sourceWords = toWordSet(normalizedSource);
  const candidateWords = toWordSet(normalizedCandidate);
  const sharedWords = [...sourceWords].filter((token) =>
    candidateWords.has(token)
  ).length;
  const overlapDenominator = Math.max(sourceWords.size, candidateWords.size, 1);
  const overlapScore = sharedWords / overlapDenominator;
  const containsBonus =
    normalizedSource.includes(normalizedCandidate) ||
    normalizedCandidate.includes(normalizedSource)
      ? 0.15
      : 0;

  return Math.min(1, overlapScore + containsBonus);
}

async function fetchHtmlWithRetries(
  candidate: RequestCandidate,
  dependencies: MarketplaceLookupDependencies
): Promise<FetchedHtmlResult> {
  let blockedByCors = false;

  for (let attempt = 0; attempt < REQUEST_RETRIES; attempt += 1) {
    try {
      const response = await dependencies.fetch(candidate.url, {
        method: 'GET',
        mode: 'cors',
        credentials: 'omit',
        redirect: 'follow',
        cache: 'no-store'
      });
      const contentType = response.headers.get('content-type') ?? '';

      if (!response.ok || !contentType.toLowerCase().includes('text/html')) {
        if (attempt < REQUEST_RETRIES - 1) {
          await dependencies.wait(75 * (attempt + 1));
        }
        continue;
      }

      return {
        requestUrl: candidate.url,
        finalUrl: response.url || candidate.url,
        html: await response.text(),
        blockedByCors: false
      };
    } catch (error) {
      if (error instanceof TypeError) {
        blockedByCors = true;
      }

      if (attempt < REQUEST_RETRIES - 1) {
        await dependencies.wait(75 * (attempt + 1));
      }
    }
  }

  return {
    requestUrl: candidate.url,
    finalUrl: candidate.url,
    html: null,
    blockedByCors
  };
}

function parseHtmlDocument(
  html: string,
  dependencies: MarketplaceLookupDependencies
): Document {
  return dependencies.domParser.parseFromString(html, 'text/html');
}

function toLookupResult(
  productData: AmazonProductData,
  foundBy: LookupFoundBy
): MarketplacePriceLookupResult {
  return {
    domain: productData.host,
    url: productData.url,
    price: productData.priceValue,
    currency: productData.currency,
    foundBy
  };
}

function tryResolveDirectMatch(
  sourceProduct: AmazonProductData,
  fetchedHtml: FetchedHtmlResult,
  dependencies: MarketplaceLookupDependencies
): MarketplacePriceLookupResult | null {
  if (!fetchedHtml.html) {
    return null;
  }

  const pageUrl = new URL(fetchedHtml.finalUrl || fetchedHtml.requestUrl);
  const parsedProduct = extractAmazonProductData(
    parseHtmlDocument(fetchedHtml.html, dependencies),
    pageUrl
  );

  if (!parsedProduct) {
    return null;
  }

  if (parsedProduct.asin === sourceProduct.asin) {
    return toLookupResult(parsedProduct, 'direct-asin');
  }

  if (
    scoreTitleSimilarity(sourceProduct.title, parsedProduct.title) >=
    TITLE_SIMILARITY_THRESHOLD
  ) {
    return toLookupResult(parsedProduct, 'direct-title-match');
  }

  return null;
}

function selectBestSearchCandidate(
  sourceProduct: AmazonProductData,
  candidates: AmazonSearchCandidate[]
): AmazonSearchCandidate | null {
  const candidatesWithPrices = candidates.filter(
    (candidate) => candidate.priceValue !== null && candidate.currency !== null
  );

  if (!candidatesWithPrices.length) {
    return null;
  }

  const exactAsinCandidate = candidatesWithPrices.find(
    (candidate) => candidate.asin === sourceProduct.asin
  );

  if (exactAsinCandidate) {
    return exactAsinCandidate;
  }

  return (
    candidatesWithPrices
      .map((candidate) => ({
        candidate,
        score: scoreTitleSimilarity(sourceProduct.title, candidate.title)
      }))
      .filter(({ score }) => score >= TITLE_SIMILARITY_THRESHOLD)
      .sort((left, right) => right.score - left.score)
      .at(0)?.candidate ?? null
  );
}

function tryResolveSearchMatch(
  sourceProduct: AmazonProductData,
  fetchedHtml: FetchedHtmlResult,
  dependencies: MarketplaceLookupDependencies
): MarketplacePriceLookupResult | null {
  if (!fetchedHtml.html) {
    return null;
  }

  const searchUrl = new URL(fetchedHtml.finalUrl || fetchedHtml.requestUrl);
  const documentNode = parseHtmlDocument(fetchedHtml.html, dependencies);
  const bestCandidate = selectBestSearchCandidate(
    sourceProduct,
    extractAmazonSearchCandidates(documentNode, searchUrl).slice(
      0,
      SEARCH_RESULT_LIMIT
    )
  );

  if (bestCandidate?.priceValue == null || !bestCandidate.currency) {
    return null;
  }

  return {
    domain: searchUrl.hostname,
    url: bestCandidate.url,
    price: bestCandidate.priceValue,
    currency: bestCandidate.currency,
    foundBy: 'search-title-match'
  };
}

async function lookupMarketplacePrice(
  sourceProduct: AmazonProductData,
  targetHost: string,
  dependencies: MarketplaceLookupDependencies
): Promise<MarketplacePriceLookupResult | null> {
  for (const candidate of buildDirectProductCandidates(
    sourceProduct.asin,
    targetHost
  )) {
    const fetchedHtml = await fetchHtmlWithRetries(candidate, dependencies);
    const matched = tryResolveDirectMatch(
      sourceProduct,
      fetchedHtml,
      dependencies
    );

    if (matched) {
      return matched;
    }

    if (fetchedHtml.blockedByCors) {
      break;
    }
  }

  for (const candidate of buildSearchCandidates(
    sourceProduct.title,
    targetHost
  )) {
    const fetchedHtml = await fetchHtmlWithRetries(candidate, dependencies);
    const matched = tryResolveSearchMatch(
      sourceProduct,
      fetchedHtml,
      dependencies
    );

    if (matched) {
      return matched;
    }
  }

  return null;
}

export async function lookupAmazonMarketplacePrices(
  sourceProduct: AmazonProductData,
  options: MarketplaceLookupOptions = {}
): Promise<MarketplacePriceLookupResult[]> {
  const dependencies = mergeDependencies(options.dependencies);
  const sourceUrl = options.sourceUrl ?? new URL(sourceProduct.url);
  const sourceMarketplace = resolveMarketplace(sourceUrl);
  const sourceHost = sourceMarketplace?.host ?? sourceProduct.host;
  const results = await Promise.all(
    getAlternateAmazonMarketplaces(sourceHost).map(async (marketplace) =>
      lookupMarketplacePrice(sourceProduct, marketplace.host, dependencies)
    )
  );

  return results.filter(
    (result): result is MarketplacePriceLookupResult => result !== null
  );
}
