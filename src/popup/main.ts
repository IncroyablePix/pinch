import './styles.css';

const browserTarget = __BROWSER_TARGET__ === 'firefox' ? 'Firefox' : 'Chromium';
const app = document.querySelector<HTMLDivElement>('#app');

if (!app) {
  throw new Error('Popup root element was not found.');
}

app.innerHTML = `
  <main class="popup-shell">
    <h1>Pinch</h1>
    <p>Build once, package for <strong>${browserTarget}</strong>.</p>
    <ul>
      <li>Manifest V3 build output</li>
      <li>TypeScript + Vite tooling</li>
      <li>CI-ready packaging</li>
    </ul>
  </main>
`;
