import { z } from "zod";

/**
 * A workflow = one built-in trigger + one action (Decisions #004, #002).
 * The action config maps each action field to a trigger field, a fixed value,
 * or a trigger field passed through a transform from a small closed list.
 * The closed list is what makes "convert the value" a checkable, valid-option fix.
 */

export const TransformSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("date_to_rfc3339"),
    fromFormat: z.enum(["MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"]),
    timeZone: z.string().default("UTC"),
  }),
  z.object({ kind: z.literal("trim") }),
  z.object({ kind: z.literal("lowercase") }),
]);
export type Transform = z.infer<typeof TransformSchema>;

export const FieldMappingSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("mapped"),
    source: z.string().min(1), // key of a trigger field
    transform: TransformSchema.optional(),
  }),
  z.object({ kind: z.literal("static"), value: z.string() }),
]);
export type FieldMapping = z.infer<typeof FieldMappingSchema>;

/** action field key -> mapping */
export const ActionConfigSchema = z.record(z.string(), FieldMappingSchema);
export type ActionConfig = z.infer<typeof ActionConfigSchema>;

/** The built-in trigger form (Decision #004). */
export const TriggerFieldSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  type: z.enum(["text", "email", "date", "number"]),
});
export const TriggerSchemaSchema = z.object({ fields: z.array(TriggerFieldSchema).min(1) });
export type TriggerSchema = z.infer<typeof TriggerSchemaSchema>;

/** Values the user typed into the trigger form for one run. */
export const TriggerDataSchema = z.record(z.string(), z.string());
export type TriggerData = z.infer<typeof TriggerDataSchema>;
