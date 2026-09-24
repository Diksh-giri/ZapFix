import postgres from "postgres";
import { getDatabaseUrl } from "../db/connection";

/** Read-only connection check. Prints only "Connected" and a table count, never the URL. */
async function main() {
  let url: string;
  try {
    url = getDatabaseUrl();
  } catch (e) {
    console.error(`Not connected. ${(e as Error).message}`);
    process.exit(1);
  }

  const sql = postgres(url, { prepare: false, max: 1, connect_timeout: 10 });
  try {
    const rows = await sql<{ n: number }[]>`
      select count(*)::int as n
      from information_schema.tables
      where table_type = 'BASE TABLE'
        and (table_schema = 'public' or (table_schema = 'private' and table_name = 'connection_secrets'))
    `;
    console.log("Connected");
    console.log(`Tables found: ${rows[0]?.n ?? 0}`);
  } catch (e) {
    const code = (e as { code?: string }).code ?? "unknown";
    console.error(`Not connected (error code: ${code}).`);
    console.error(`Hint: ${hintFor(code)}`);
    process.exitCode = 1;
  } finally {
    await sql.end({ timeout: 5 });
  }
}

function hintFor(code: string): string {
  switch (code) {
    case "ENOTFOUND":
    case "EAI_AGAIN":
      return "The host name could not be found. Check the connection string for typos.";
    case "ECONNREFUSED":
    case "ETIMEDOUT":
    case "CONNECT_TIMEOUT":
    case "ENETUNREACH":
      return "Could not reach the server. Direct connections often fail on home networks; use the Session pooler string from Supabase (Connect > Session pooler).";
    case "28P01":
    case "28000":
      return "Password or user rejected. Check the password (special characters must be URL-encoded) and that the user name matches the pooler format.";
    case "3D000":
      return "That database name does not exist. It is normally 'postgres'.";
    default:
      return "Check DATABASE_URL in .env.local against the string in the Supabase dashboard (Connect).";
  }
}

void main();
