export function createManifest(target) {
  const manifest = {
    manifest_version: 3,
    name: 'Pinch',
    version: '0.1.0',
    description:
      'Cross-browser extension scaffold for Chromium and Firefox packaging.',
    action: {
      default_title: 'Pinch',
      default_popup: 'popup.html'
    },
    background: {
      service_worker: 'background.js',
      type: 'module'
    },
    permissions: ['storage'],
    host_permissions: ['<all_urls>'],
    content_scripts: [
      {
        matches: ['<all_urls>'],
        js: ['content.js'],
        run_at: 'document_idle'
      }
    ]
  };

  if (target === 'firefox') {
    manifest.browser_specific_settings = {
      gecko: {
        id: 'pinch@example.com',
        strict_min_version: '121.0'
      }
    };
  }

  return manifest;
}
