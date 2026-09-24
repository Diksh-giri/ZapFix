import { z } from "zod";
import { AppError } from "@/lib/errors";

/** A path id that is not a uuid can never match a row, so answer "not found" instead of a database error. */
export function parseId(value: string | undefined, what = "Item"): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new AppError("not_found", `${what} not found.`);
  return parsed.data;
}
