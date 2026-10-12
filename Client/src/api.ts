const base = (import.meta.env.VITE_API_URL || 'http://localhost:4000/api').replace(/\/$/, '');

export async function api<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  const token = localStorage.getItem('friday-access-token');
  const headers = new Headers(init?.headers);

  if (init?.body && !(init.body instanceof FormData) && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  let response: Response;
  try {
    response = await fetch(`${base}${path.startsWith('/') ? path : `/${path}`}`, {
      ...init,
      headers,
    });
  } catch {
    throw new Error('Unable to connect to Friday Master. Check your connection and try again.');
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
