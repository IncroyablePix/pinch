import { describe, expect, it } from 'vitest';
import { createManifest } from '../src/manifest';

describe('createManifest', () => {
  it('creates a Chromium manifest without Firefox-specific settings', () => {
    const manifest = createManifest('chromium');

    expect(manifest.manifest_version).toBe(3);
    expect(manifest.background).toEqual({
      service_worker: 'background.js',
      type: 'module'
    });
    expect(manifest.browser_specific_settings).toBeUndefined();
  });

  it('creates a Firefox manifest with gecko metadata', () => {
    const manifest = createManifest('firefox');

    expect(manifest.browser_specific_settings).toEqual({
      gecko: {
        id: 'pinch@example.com',
        strict_min_version: '121.0'
      }
    });
    expect(manifest.content_scripts[0]?.js).toEqual(['content.js']);
  });
});
