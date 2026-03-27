import './styles.css';
import type { AmazonProductData } from '../shared/amazon';
import {
  lookupAmazonMarketplacePrices,
  type MarketplacePriceLookupResult
} from './amazonLookup';
import { requestActiveTabProductData } from './chrome';

const browserTarget = __BROWSER_TARGET__ === 'firefox' ? 'Firefox' : 'Chromium';
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Popup root element was not found.');
}

function formatPrice(value: number, currency: string, locale: string): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: 2
  }).format(value);
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderResultItem(result: MarketplacePriceLookupResult): string {
  return `
    <li class="result-card">
      <div class="result-header">
        <strong>${escapeHtml(result.domain)}</strong>
        <span class="result-found-by">${escapeHtml(result.foundBy)}</span>
      </div>
      <a class="result-link" href="${escapeHtml(result.url)}" target="_blank" rel="noreferrer">
        ${escapeHtml(result.url)}
      </a>
      <div class="result-price">${escapeHtml(result.currency)} ${escapeHtml(result.price.toFixed(2))}</div>
    </li>
  `;
}

function renderShell(content: string): void {
  app.innerHTML = `
    <main class="popup-shell">
      <header class="popup-header">
        <div>
          <h1>Pinch</h1>
          <p>Cross-domain Amazon pricing lookup in ${browserTarget}.</p>
        </div>
      </header>
      ${content}
    </main>
  `;
}

function renderMessage(title: string, body: string): void {
  renderShell(`
    <section class="panel">
      <h2>${escapeHtml(title)}</h2>
      <p>${escapeHtml(body)}</p>
    </section>
  `);
}

function renderLookupResults(
  sourceProduct: AmazonProductData,
  results: MarketplacePriceLookupResult[]
): void {
  const summary = formatPrice(
    sourceProduct.priceValue,
    sourceProduct.currency,
    sourceProduct.locale
  );

  renderShell(`
    <section class="panel">
      <h2>${escapeHtml(sourceProduct.title)}</h2>
      <dl class="product-summary">
        <div>
          <dt>ASIN</dt>
          <dd>${escapeHtml(sourceProduct.asin)}</dd>
        </div>
        <div>
          <dt>Current</dt>
          <dd>${escapeHtml(summary)}</dd>
        </div>
        <div>
          <dt>Domain</dt>
          <dd>${escapeHtml(sourceProduct.host)}</dd>
        </div>
      </dl>
    </section>
    <section class="panel">
      <h2>Other marketplaces</h2>
      ${
        results.length
          ? `<ul class="results-list">${results.map(renderResultItem).join('')}</ul>`
          : '<p>No alternate marketplace prices were available from client-side fetches.</p>'
      }
    </section>
  `);
}

async function initializePopup(): Promise<void> {
  renderMessage(
    'Loading',
    'Reading the active Amazon product and checking other marketplaces…'
  );

  try {
    const sourceProduct =
      await requestActiveTabProductData<AmazonProductData>();

    if (!sourceProduct) {
      renderMessage(
        'Unsupported page',
        'Open the popup on a supported Amazon product page to compare marketplace pricing.'
      );
      return;
    }

    const results = await lookupAmazonMarketplacePrices(sourceProduct);
    renderLookupResults(sourceProduct, results);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    renderMessage('Lookup failed', message);
  }
}

void initializePopup();
