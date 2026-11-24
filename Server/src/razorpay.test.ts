import { createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { verifyRazorpayPaymentSignature, verifyRazorpayWebhookSignature } from './razorpay.js';

describe('Razorpay signature boundary', () => {
  const secret = 'test-only-webhook-secret';
  it('accepts only the server-calculated payment signature', () => {
    const signature = createHmac('sha256', secret).update('order_test|pay_test').digest('hex');
    expect(verifyRazorpayPaymentSignature('order_test', 'pay_test', signature, secret)).toBe(true);
    expect(verifyRazorpayPaymentSignature('order_test', 'pay_other', signature, secret)).toBe(false);
  });
  it('validates an unparsed raw webhook payload and rejects replay mutation', () => {
    const raw = Buffer.from('{"event":"payment.captured","payload":{"payment":{"entity":{"id":"pay_test"}}}}');
    const signature = createHmac('sha256', secret).update(raw).digest('hex');
    expect(verifyRazorpayWebhookSignature(raw, signature, secret)).toBe(true);
    expect(verifyRazorpayWebhookSignature(Buffer.from(raw.toString().replace('captured', 'failed')), signature, secret)).toBe(false);
  });
});
