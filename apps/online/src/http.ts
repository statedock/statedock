export function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get("Origin");
  if (!origin) return request.headers.get("Sec-Fetch-Site") !== "cross-site";
  const urlOrigin = new URL(request.url).origin;
  if (origin === urlOrigin) return true;
  return false;
}
export function jsonError(code: string, status: number, message?: string) {
  return Response.json({ error: code, ...(message ? { message } : {}) }, { status });
}
