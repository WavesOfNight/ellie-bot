/** URL absolue du panel (NEXTAUTH_URL), utilisée pour les retours OAuth. */
export function appUrl(path: string): string {
  const base = (process.env.NEXTAUTH_URL ?? process.env.AUTH_URL ?? "http://localhost:3000").replace(/\/+$/, "");
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
