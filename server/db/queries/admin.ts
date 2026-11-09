import { count, desc, like, or, sql } from "drizzle-orm";
import { db } from "hub:db";
import type { AdminOrganization, AdminUserList } from "#layers/core/shared/types/admin";
import { ADMIN_USERS_PAGE_SIZE } from "#layers/core/shared/utils/admin";
import { subquery, tables } from "#layers/core/server/utils/database";
import { serverEdition } from "#layers/core/server/utils/edition";

const { member, organization, sites, user } = tables;

function escapeLike(text: string) {
	return text.replaceAll(/[\\%_]/g, character => `\\${character}`);
}

export async function listUsersForAdmin({ q, page }: { q?: string; page: number }): Promise<AdminUserList> {
	const pattern = q ? `%${escapeLike(q.toLowerCase())}%` : undefined;
	const matches = pattern
		? or(like(sql`lower(${user.email})`, sql`${pattern} ESCAPE '\\'`), like(sql`lower(${user.name})`, sql`${pattern} ESCAPE '\\'`))
		: undefined;
	const [rows, total] = await Promise.all([
		db.select({
			id: user.id,
			name: user.name,
			email: user.email,
			emailVerified: user.emailVerified,
			role: user.role,
			createdAt: sql<number>`${user.createdAt}`.mapWith(Number),
			organizations: subquery<number>(sql`SELECT COUNT(*) FROM ${member} WHERE ${member.userId} = ${user.id}`).mapWith(Number),
		})
			.from(user)
			.where(matches)
			.orderBy(desc(user.createdAt))
			.limit(ADMIN_USERS_PAGE_SIZE)
			.offset((page - 1) * ADMIN_USERS_PAGE_SIZE),
		db.select({ total: count() }).from(user).where(matches).get(),
	]);
	return { users: rows, total: total?.total ?? 0 };
}

export async function listOrganizationsForAdmin(): Promise<AdminOrganization[]> {
	const rows = await db.select({
		id: organization.id,
		name: organization.name,
		slug: organization.slug,
		createdAt: sql<number>`${organization.createdAt}`.mapWith(Number),
		ownerEmail: subquery<string | null>(sql`SELECT ${user.email} FROM ${member} INNER JOIN ${user} ON ${user.id} = ${member.userId} WHERE ${member.organizationId} = ${organization.id} AND ${member.role} = 'owner' LIMIT 1`),
		members: subquery<number>(sql`SELECT COUNT(*) FROM ${member} WHERE ${member.organizationId} = ${organization.id}`).mapWith(Number),
		sites: subquery<number>(sql`SELECT COUNT(*) FROM ${sites} WHERE ${sites.organizationId} = ${organization.id}`).mapWith(Number),
		...serverEdition().organizationColumns,
	})
		.from(organization)
		.orderBy(desc(organization.createdAt));
	return rows as AdminOrganization[];
}

// D1 reports the size in every result's `meta.size_after` but rejects `PRAGMA page_count`; local SQLite is the reverse.
export async function databaseSizeBytes() {
	const result = await db.run(sql`SELECT 1`) as { meta?: { size_after?: number } };
	if (typeof result.meta?.size_after === "number") {
		return result.meta.size_after;
	}
	const row = await db.get<{ size: number }>(sql`SELECT page_count * page_size AS size FROM pragma_page_count(), pragma_page_size()`);
	return Number(row?.size ?? 0);
}
