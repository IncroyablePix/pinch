import { existsSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createManifest } from '../src/manifest';

describe('build artifact conventions', () => {
  it('uses stable artifact names expected by the packaging scripts', () => {
    const manifest = createManifest('chromium');

    expect(manifest.action.default_popup).toBe('popup.html');
    expect(manifest.background.service_worker).toBe('background.js');
    expect(manifest.content_scripts[0]?.js).toContain('content.js');
  });

  it('keeps package metadata aligned with CI expectations', () => {
    const packageJson = JSON.parse(
      readFileSync(new URL('../package.json', import.meta.url), 'utf8')
    ) as {
      scripts: Record<string, string>;
    };

    expect(packageJson.scripts.build).toContain('build:chromium');
    expect(packageJson.scripts.build).toContain('build:firefox');
    expect(packageJson.scripts.pack).toContain('scripts/pack.mjs chromium');
    expect(packageJson.scripts.pack).toContain('scripts/pack.mjs firefox');
  });

  it('includes the contributor guidance documents required for repository setup', () => {
    expect(existsSync(new URL('../CONTRIBUTING.md', import.meta.url))).toBe(
      true
    );
    expect(existsSync(new URL('../CODE_OF_CONDUCT.md', import.meta.url))).toBe(
      true
    );
    expect(existsSync(new URL('../LICENSE', import.meta.url))).toBe(true);
  });
});
