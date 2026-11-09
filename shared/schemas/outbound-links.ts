import { z } from "zod";

export const outboundLinkQuerySchema = z.object({
	url: z.string().min(1).max(2048),
});
