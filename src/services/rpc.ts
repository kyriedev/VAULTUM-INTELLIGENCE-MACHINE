export async function invokeVaultumRpc<T>(domain: string, rpc: string, input: Record<string, unknown> = {}): Promise<T | null> {
  try {
    const response = await fetch(`/api/${domain}/v1/${rpc}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-store',
      },
      body: JSON.stringify(input),
    });
    if (!response.ok) return null;
    const payload = await response.json() as { ok?: boolean; data?: T };
    return payload.ok ? (payload.data ?? null) : null;
  } catch {
    return null;
  }
}
