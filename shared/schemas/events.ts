import { z } from "zod";

export const eventPropertiesQuerySchema = z.object({
	name: z.string().min(1).max(200),
	path: z.string().max(2048).optional(),
});
