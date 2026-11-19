import { describe, expect, it } from 'vitest';
import { expiredSubscriptions } from './subscriptionLifecycle.js';

describe('expiredSubscriptions', () => {
  it('uses an injected clock and leaves suspended or undated subscriptions unchanged', () => {
    const due = expiredSubscriptions([
      { id: 'trial-due', status: 'TRIAL', expiresAt: '2026-11-18T23:59:59.000Z' },
      { id: 'active-due', status: 'ACTIVE', expiresAt: '2026-11-19T00:00:00.000Z' },
      { id: 'suspended', status: 'SUSPENDED', expiresAt: '2026-11-18T00:00:00.000Z' },
      { id: 'no-expiry', status: 'ACTIVE', expiresAt: null },
    ], new Date('2026-11-19T00:00:00.000Z'));
    expect(due.map(item => item.id)).toEqual(['trial-due', 'active-due']);
  });
});
