import { z } from "zod";
import { DIGEST_SETTINGS } from "../utils/digests";

export const digestSubscriptionSchema = z.object({
	frequency: z.enum(DIGEST_SETTINGS),
});

export const digestUnsubscribeSchema = z.object({
	token: z.string().min(1).max(500),
});
