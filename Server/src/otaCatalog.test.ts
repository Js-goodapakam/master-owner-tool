import { describe, expect, it } from 'vitest';
import { otaProviders, otaProviderIds } from './otaCatalog.js';

describe('OTA connectivity feasibility catalog', () => {
  it('has unique provider identifiers with official documentation links', () => {
    expect(new Set(otaProviderIds).size).toBe(otaProviders.length);
    for (const provider of otaProviders) {
      expect(provider.docsUrl).toMatch(/^https:\/\//);
      expect(provider.requirements.length).toBeGreaterThan(0);
      expect(provider.capabilities.length).toBeGreaterThan(0);
      expect(provider.feasibility).not.toEqual('Connected');
    }
  });
  it('only offers direct live verification through an implemented provider adapter', () => {
    expect(otaProviders.filter(p => p.supportsLiveVerification).map(p => p.id)).toEqual(['channex']);
  });
  it('tracks Agoda certification requirements and property-level MMT mapping separately', () => {
    const agoda = otaProviders.find(p => p.id === 'agoda');
    expect(agoda?.requirements.join(' ')).toContain('GetProduct');
    const mmt = otaProviders.find(p => p.id === 'go-mmt');
    expect(mmt?.auth).toContain('Engage Stay');
  });
});
