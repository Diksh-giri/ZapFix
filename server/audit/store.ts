import type { EventType } from "./events";

export interface StoredEvent {
  userId: string;
  runId: string | null;
  type: EventType;
  payload: Record<string, string | number | boolean | null> | null;
}

/** Persistence port for events and rate limits. The Drizzle version lives in drizzle-store.ts. */
export interface AuditStore {
  insertEvent(event: StoredEvent): Promise<void>;
  hasEvent(userId: string, runId: string, type: EventType): Promise<boolean>;
  /** Atomically adds 1 to the counter for this user, bucket and hour, and returns the new count. */
  incrementRateLimit(userId: string, bucket: string, windowStart: Date): Promise<number>;
  runOwnedBy(runId: string, userId: string): Promise<boolean>;
}
