import { z } from "zod";

export const createApiKeySchema = z.object({
	name: z.string().trim().max(100).optional().transform(name => name || "API key"),
});

export type CreateApiKeyInput = z.infer<typeof createApiKeySchema>;
