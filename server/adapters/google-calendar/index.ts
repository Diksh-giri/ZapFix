import type { AppAdapter } from "../types";
import { missingRequiredMappings } from "../types";
import { AppError } from "@/lib/errors";

/**
 * Google Calendar adapter. FIRST real adapter to build (Decision #034, tasks T9 + T11).
 * It can produce all three PRD failure types with its real API:
 *   missing required field -> attendee/title empty
 *   invalid format         -> start/end not RFC 3339
 *   expired connection     -> token revoked, or 7-day testing-mode expiry (Decision #032)
 *
 * TODO(T11):
 *  - execute(): call the real API with ctx.timeoutMs, map responses to StandardError.
 *  - Check whether a client-supplied event id works as duplicate protection (TDD section 28 item 5).
 *  - Record real error responses under tests/fixtures/google-calendar/ and build rules from them.
 *  - Mask any user value the API echoes in an error message (TDD section 28 item 6).
 */
export const googleCalendarAdapter: AppAdapter = {
  id: "google_calendar",
  provider: "google",
  actions: [
    {
      key: "create_event",
      label: "Create event",
      fields: [
        { key: "title", label: "Title", required: true, type: "text" },
        { key: "start", label: "Start", required: true, type: "datetime_rfc3339" },
        { key: "end", label: "End", required: true, type: "datetime_rfc3339" },
        { key: "attendee_email", label: "Attendee email", required: true, type: "email" },
      ],
    },
  ],
  validateConfig(actionKey, config) {
    const action = this.actions.find((a) => a.key === actionKey);
    return action ? missingRequiredMappings(action, config) : [`Unknown action "${actionKey}"`];
  },
  async execute() {
    throw new AppError("not_implemented", "Google Calendar adapter is not implemented yet (T11).");
  },
};
