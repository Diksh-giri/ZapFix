import { ConnectionsScreen } from "@/components/ConnectionsScreen";
import { getOAuthNotice } from "@/lib/connections-page";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const params = await searchParams;
  return <ConnectionsScreen notice={getOAuthNotice(params)} />;
}
