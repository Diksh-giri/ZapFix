import { describe, expect, it } from "vitest";
import { TriggerSchemaSchema } from "@/lib/schemas/workflow-config";

describe("workflow configuration schemas", () => {
  it("keeps legacy Sheets text-list trigger fields readable", () => {
    expect(TriggerSchemaSchema.safeParse({
      fields: [{ key: "row_values", label: "Row values", type: "text_list" }],
    }).success).toBe(true);
  });
});
