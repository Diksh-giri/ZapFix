import "server-only";
import { db } from "@/db/client";
import { createDrizzleProposalStore } from "./drizzle-store";

/** Wires the proposal code to the real database. Used by the route handlers. */
export const getProposalStore = () => createDrizzleProposalStore(db);
export const proposalDeps = () => ({ store: getProposalStore(), now: () => new Date() });
