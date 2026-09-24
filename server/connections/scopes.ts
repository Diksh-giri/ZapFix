/**
 * The scopes ZapFix requests, per app. Narrowest that allow the action (T9 build item 1).
 * Only scopes the human has approved belong here. Restricted scopes (full Drive, reading or
 * composing Gmail) are deliberately absent: they need Google's security review.
 */
export const GOOGLE_IDENTITY_SCOPES = ["openid", "email"];

export const GOOGLE_APP_SCOPES = {
  google_calendar: ["https://www.googleapis.com/auth/calendar.events.owned"],
  google_sheets: ["https://www.googleapis.com/auth/spreadsheets"],
  gmail: ["https://www.googleapis.com/auth/gmail.send"], // Sensitive: send only, cannot read mail
  google_drive: ["https://www.googleapis.com/auth/drive.file"], // Non-sensitive: files the app creates or is given
} as const;

export type GoogleApp = keyof typeof GOOGLE_APP_SCOPES;

/** Everything requested in one Google connection (the tester approves it on one consent screen). */
export function requestedGoogleScopes(): string[] {
  return [...GOOGLE_IDENTITY_SCOPES, ...Object.values(GOOGLE_APP_SCOPES).flat()];
}

/** Slack bot scopes: post messages, including to public channels the bot has not joined. */
export const SLACK_BOT_SCOPES = ["chat:write", "chat:write.public"];
