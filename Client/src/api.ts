// Production serves the Owner API on the same origin. Keeping the local URL only
// for Vite development prevents a deployed web app from trying to call localhost.
const base = (
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:4000/api' : '/api')
).replace(/\/$/, '');
let activeProductCode: string | null = null;
export function setActiveProductContext(productCode: string | null) { activeProductCode = productCode; }

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = localStorage.getItem('friday-access-token');
  const headers = new Headers(init?.headers);

  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  // An invitation activation request supplies its own short-lived token.
  // Never override that explicit Authorization header with a previous browser session.
  if (token && !headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    const relativePath = path.startsWith('/') ? path : `/${path}`;
    const url = new URL(`${base}${relativePath}`, window.location.origin);
    if (activeProductCode && !relativePath.startsWith('/products') && !relativePath.startsWith('/auth')) url.searchParams.set('productCode', activeProductCode);
    response = await fetch(url.toString(), {
      ...init,
      headers,
    });
  } catch {
    throw new Error('Unable to connect to Engage Owner Console. Check your connection and try again.');
  }

  const contentType = response.headers.get('content-type') || '';
  const payload: any = contentType.includes('application/json')
    ? await response.json().catch(() => ({}))
    : { message: await response.text().catch(() => '') };

  if (response.status === 401) {
    localStorage.removeItem('friday-access-token');
    localStorage.removeItem('friday-refresh-token');
    window.dispatchEvent(new CustomEvent('friday:session-expired'));
    throw new Error(payload.message || 'Your session has expired. Please sign in again.');
  }

  if (!response.ok) {
    throw new Error(
      payload.message || payload.msg || `The request could not be completed (${response.status}).`,
    );
  }

  return payload as T;
}
