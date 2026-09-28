import "server-only";
import { db } from "@/db/client";
import { createDrizzleDiagnosisStore } from "./drizzle-store";

/** Wires T13 diagnosis persistence to the real database. */
export const getDiagnosisStore = () => createDrizzleDiagnosisStore(db);
