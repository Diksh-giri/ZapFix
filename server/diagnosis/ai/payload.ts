import type { Category } from "@/lib/types";
import type { StandardError } from "@/lib/schemas/standard-error";
import type { ActionConfig } from "@/lib/schemas/workflow-config";
import type { Candidate } from "@/server/diagnosis/rules/types";

/**
 * Decision #018: the AI sees field NAMES and value SHAPES, never raw content.
 * Whatever is in this payload is what the user sees as "evidence".
 * NEVER add tokens, credentials, names, message text or other personal content here.
 */

export type ValueShape =
  | "empty"
  | "email-like"
  | "date MM/DD/YYYY"
  | "date YYYY-MM-DD"
  | "datetime RFC 3339"
  | "number"
  | "text";

export function shapeOf(value: string): ValueShape {
  const v = value.trim();
  if (v === "") return "empty";
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return "email-like";
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$/.test(v)) return "datetime RFC 3339";
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) return "date YYYY-MM-DD";
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(v)) return "date MM/DD/YYYY"; // MM/DD vs DD/MM is ambiguous: rules decide, not the AI
  if (/^-?\d+(\.\d+)?$/.test(v)) return "number";
  return "text";
}

/** App error messages can echo the submitted value. Mask quoted substrings before storing or sending. */
export function maskQuotedValues(message: string): string {
  return message
    .replace(/"[^"]*"/g, '"[value]"')
    .replace(/'[^']*'/g, "'[value]'")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[email]");
}

export interface AiPayload {
  category: Category;
  error: { code: string; message: string; field?: string };
  fields: Array<{ key: string; mapping: string; valueShape: ValueShape }>;
  candidates: Array<{ id: string; description: string }>;
}

export function buildAiPayload(input: {
  category: Category;
  error: StandardError;
  config: ActionConfig;
  resolved: Record<string, string>;
  candidates: Candidate[];
}): AiPayload {
  const { category, error, config, resolved, candidates } = input;
  return {
    category,
    error: {
      code: error.code,
      message: maskQuotedValues(error.message),
      ...(error.field ? { field: error.field } : {}),
    },
    fields: Object.entries(config).map(([key, mapping]) => ({
      key,
      mapping:
        mapping.kind === "static"
          ? "fixed value"
          : `trigger field "${mapping.source}"${mapping.transform ? ` via ${mapping.transform.kind}` : ""}`,
      valueShape: shapeOf(resolved[key] ?? ""),
    })),
    candidates: candidates.map((c) => ({ id: c.id, description: c.description })),
  };
}
