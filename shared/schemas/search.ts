import { z } from "zod";

export const searchPropertySchema = z.object({
	property: z.string().trim().min(1, "Choose a property").max(500),
});

export const bingApiKeySchema = z.object({
	apiKey: z.string().trim().min(1, "Paste the API key").max(200),
});
