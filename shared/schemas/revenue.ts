import { z } from "zod";
import { REVENUE_CURRENCIES, REVENUE_ENVIRONMENTS, REVENUE_PROVIDERS } from "../utils/revenue";

export const revenueConnectionSchema = z.object({
	provider: z.enum(REVENUE_PROVIDERS, "Choose a Revenue provider"),
	environment: z.enum(REVENUE_ENVIRONMENTS),
	accessToken: z.string().trim().min(1, "Paste the access token").max(500),
	currency: z.enum(REVENUE_CURRENCIES),
});

export const webhookSecretSchema = z.object({
	webhookSecret: z.string().trim().regex(/^whsec_\w+$/, "Paste the signing secret, which starts with whsec_").max(200),
});

export type RevenueConnectionBody = z.infer<typeof revenueConnectionSchema>;
