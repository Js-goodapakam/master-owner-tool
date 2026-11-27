export async function verifyChannexCredential(environment: string, key: string, send = fetch) {
  const base = environment === 'production' ? 'https://app.channex.io' : 'https://staging.channex.io';
  try {
    const response = await send(base + '/api/v1/properties', {
      headers: { 'user-api-key': key, accept: 'application/json' },
      signal: AbortSignal.timeout(8000), redirect: 'manual', cache: 'no-store',
    });
    if (response.ok) return { success: true, lastError: null };
    if (response.status === 401 || response.status === 403) {
      return { success: false, lastError: 'Channex rejected the credentials or property access.' };
    }
    if (response.status === 429 || response.status >= 500) {
      return { success: false, lastError: 'Channex is temporarily unavailable. Retry verification later.' };
    }
    return { success: false, lastError: 'Channex returned an unexpected HTTP status (' + response.status + ').' };
  } catch {
    return { success: false, lastError: 'Channex verification timed out or could not reach the provider. Retry later.' };
  }
}
