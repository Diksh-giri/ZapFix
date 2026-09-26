export function safeNextPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) return "/connections";
  return value;
}

export function publicOrigin(headers: Headers): string {
  const vercelHost = process.env.VERCEL_URL ?? process.env.VERCEL_PROJECT_PRODUCTION_URL;
  if (vercelHost) return `https://${vercelHost}`;
  const forwardedHost = headers.get("x-forwarded-host");
  const host = forwardedHost ?? headers.get("host") ?? "localhost:3000";
  const forwardedProto = headers.get("x-forwarded-proto");
  const protocol = forwardedProto === "https" || (!forwardedProto && process.env.NODE_ENV === "production") ? "https" : "http";
  return `${protocol}://${host}`;
}
