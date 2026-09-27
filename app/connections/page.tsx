import { headers } from "next/headers";
import { ConnectionsScreen } from "@/components/ConnectionsScreen";
import { getOAuthNotice, shouldShowSlackHttpsWarning } from "@/lib/connections-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const [params, requestHeaders] = await Promise.all([searchParams, headers()]);
  const protocol = `${requestHeaders.get("x-forwarded-proto")?.split(",")[0]?.trim() ?? "http"}:`;
  const hostHeader = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost";
  const hostname = (hostHeader.split(":")[0] ?? "localhost").toLowerCase();

  return (
    <ConnectionsScreen
      notice={getOAuthNotice(params)}
      showSlackHttpsWarning={shouldShowSlackHttpsWarning({ protocol, hostname })}
    />
  );
}
