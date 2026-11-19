export type LifecycleSubscription = {
  id: string;
  status: string;
  expiresAt: string | null;
};

/**
 * Pure, clock-injected selection logic used by the durable control-plane
 * worker. It deliberately does not auto-renew paid services: a verified
 * payment or an explicit Owner renewal must activate a new term.
 */
export function expiredSubscriptions(
  subscriptions: LifecycleSubscription[],
  now: Date,
): LifecycleSubscription[] {
  const timestamp = now.getTime();
  return subscriptions.filter((subscription) => {
    if (!['TRIAL', 'ACTIVE'].includes(subscription.status) || !subscription.expiresAt) return false;
    const expiry = new Date(subscription.expiresAt).getTime();
    return Number.isFinite(expiry) && expiry <= timestamp;
  });
}
