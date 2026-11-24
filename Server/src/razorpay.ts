import { createHmac, timingSafeEqual } from 'node:crypto';

export type RazorpayOrder = { id: string; amount: number; currency: string; status: string };

function equalHex(expected: string, supplied: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(supplied, 'hex'));
}

export function verifyRazorpayPaymentSignature(orderId: string, paymentId: string, signature: string, secret: string): boolean {
  if (!orderId || !paymentId || !secret) return false;
  const expected = createHmac('sha256', secret).update(`${orderId}|${paymentId}`).digest('hex');
  return equalHex(expected, signature);
}

export function verifyRazorpayWebhookSignature(rawBody: Buffer, signature: string | undefined, secret: string): boolean {
  if (!signature || !secret) return false;
  return equalHex(createHmac('sha256', secret).update(rawBody).digest('hex'), signature);
}

export async function createRazorpayOrder(input: { keyId: string; keySecret: string; amount: number; currency: string; receipt: string; notes: Record<string, string> }): Promise<RazorpayOrder> {
  if (!Number.isSafeInteger(input.amount) || input.amount <= 0) throw new Error('Invalid payment amount.');
  if (!/^[A-Z]{3}$/.test(input.currency)) throw new Error('Invalid payment currency.');
  const authorization = Buffer.from(`${input.keyId}:${input.keySecret}`).toString('base64');
  const response = await fetch('https://api.razorpay.com/v1/orders', {
    method: 'POST',
    headers: { authorization: `Basic ${authorization}`, 'content-type': 'application/json' },
    body: JSON.stringify({ amount: input.amount, currency: input.currency, receipt: input.receipt, notes: input.notes }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error(`Razorpay order creation failed (${response.status}).`);
  const order = await response.json() as RazorpayOrder;
  if (!order.id || order.amount !== input.amount || order.currency !== input.currency || order.status !== 'created') throw new Error('Razorpay returned an invalid order.');
  return order;
}
