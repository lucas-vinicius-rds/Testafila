/** Exact origins accepted by CORS and project mutations; no wildcard matching. */
export function getAppOrigins(value: string | undefined = process.env.APP_ORIGIN): string[] {
  return [...new Set((value ?? 'http://localhost:3000').split(',').map((origin) => origin.trim()).filter(Boolean))];
}
