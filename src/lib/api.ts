
const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL || '').replace(/\/+$/, '');

export async function apiRequest<T = unknown>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const isFormData =
    typeof FormData !== 'undefined' && options.body instanceof FormData;

  const headers: Record<string, string> = {
    ...(isFormData
      ? {}
      : { 'Content-Type': 'application/json' }),
    ...(options.headers as Record<string, string> | undefined),
  };

  const endpoint = `${API_BASE_URL}${url}`;

  const resp = await fetch(endpoint, {
    ...options,
    credentials: 'include',
    headers,
  });

  const contentType = resp.headers.get('content-type') || '';

  if (!resp.ok) {
    let message = `Request failed (${resp.status})`;

    if (contentType.includes('application/json')) {
      const data = (await resp.json().catch(() => ({}))) as {
        error?: string;
        message?: string;
      };
      message = data.error || data.message || message;
    } else {
      const txt = await resp.text().catch(() => '');
      if (txt) message = txt.slice(0, 200);
    }

    throw new Error(message);
  }

  if (contentType.includes('application/json')) {
    return (await resp.json()) as T;
  }

  return (await resp.text()) as unknown as T;
}
