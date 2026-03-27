const browserTarget = __BROWSER_TARGET__ === 'firefox' ? 'Firefox' : 'Chromium';
const bannerId = 'pinch-extension-banner';

function ensureBanner(): void {
  if (document.getElementById(bannerId)) {
    return;
  }

  const banner = document.createElement('aside');
  banner.id = bannerId;
  banner.textContent = `Pinch content script active in ${browserTarget}.`;
  banner.style.position = 'fixed';
  banner.style.right = '1rem';
  banner.style.bottom = '1rem';
  banner.style.padding = '0.75rem 1rem';
  banner.style.borderRadius = '999px';
  banner.style.background = '#1f2937';
  banner.style.color = '#ffffff';
  banner.style.fontFamily = 'system-ui, sans-serif';
  banner.style.fontSize = '14px';
  banner.style.zIndex = '2147483647';
  document.body.appendChild(banner);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', ensureBanner, { once: true });
} else {
  ensureBanner();
}
