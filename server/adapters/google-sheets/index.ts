import type { AppAdapter } from "../types";
import { missingRequiredMappings } from "../types";
import { AppError } from "@/lib/errors";

/**
 * Google Sheets adapter. Built AFTER Slack (Decision #034, task T26).
 * Reuses the Google connection from Calendar. Sheets is forgiving about formats,
 * so the invalid-format scenario is covered mainly by Calendar.
 */
export const googleSheetsAdapter: AppAdapter = {
  id: "google_sheets",
  provider: "google",
  actions: [
    {
      key: "append_row",
      label: "Append row",
      fields: [
        { key: "spreadsheet_id", label: "Spreadsheet", required: true, type: "text" },
        { key: "sheet_name", label: "Sheet name", required: true, type: "text" },
        { key: "values", label: "Row values", required: true, type: "text_list" },
      ],
    },
  ],
  validateConfig(actionKey, config) {
    const action = this.actions.find((a) => a.key === actionKey);
    return action ? missingRequiredMappings(action, config) : [`Unknown action "${actionKey}"`];
  },
  async execute() {
    throw new AppError("not_implemented", "Google Sheets adapter is not implemented yet (T26).");
  },
};
