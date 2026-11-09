import { z } from "zod";

export const adminUsersQuerySchema = z.object({
	q: z.string().trim().max(200).optional(),
	page: z.coerce.number().int().min(1).max(10_000).default(1),
});
