function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, '');
}

export function getApiBase(): string {
  const configured = (((import.meta as any).env?.VITE_API_BASE || '/api') as string).trim();
  return trimTrailingSlash(configured || '/api');
}

export function buildApiUrl(path: string): string {
  const base = getApiBase();
  const normalizedPath = path.startsWith('/') ? path.slice(1) : path;

  if (/^https?:\/\//i.test(base)) {
    const href = base.endsWith('/') ? base : `${base}/`;
    return new URL(normalizedPath, href).toString();
  }

  return `${base}/${normalizedPath}`;
}
