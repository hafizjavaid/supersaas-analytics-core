import { sql } from "drizzle-orm";
import type { SQL } from "drizzle-orm";
import * as schema from "#layers/core/server/db/schema";

export const tables = schema;

// Nested, so the columns keep their table: drizzle writes a one-table select's own columns unqualified.
export function subquery<T>(query: SQL) {
	return sql<T>`(${query})`;
}
