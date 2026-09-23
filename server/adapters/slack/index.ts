import type { AppAdapter } from "../types";
import { missingRequiredMappings } from "../types";
import { AppError } from "@/lib/errors";

/**
 * Slack adapter. Built AFTER Milestone 1 (Decision #034, task T25).
 * Slack has no native duplicate protection: rely on the one-success-per-step rule
 * and the uncertain-outcome rule (TDD section 12).
 */
export const slackAdapter: AppAdapter = {
  id: "slack",
  provider: "slack",
  actions: [
    {
      key: "post_message",
      label: "Post message",
      fields: [
        { key: "channel", label: "Channel", required: true, type: "text" },
        { key: "text", label: "Message", required: true, type: "text" },
      ],
    },
  ],
  validateConfig(actionKey, config) {
    const action = this.actions.find((a) => a.key === actionKey);
    return action ? missingRequiredMappings(action, config) : [`Unknown action "${actionKey}"`];
  },
  async execute() {
    throw new AppError("not_implemented", "Slack adapter is not implemented yet (T25).");
  },
};
