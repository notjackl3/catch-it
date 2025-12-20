export async function googleFetchJson<TResponse>(
  url: string,
  init: RequestInit
): Promise<TResponse> {
  const res = await fetch(url, init);

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Google API error ${res.status}: ${text}`);
  }

  return (await res.json()) as TResponse;
}