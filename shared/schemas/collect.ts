import { z } from "zod";

export const collectRequestSchema = z.object({
	site_id: z.string().min(1).max(64),
	path: z.string().min(1).max(2048).optional(),
	title: z.string().max(500).optional().nullable(),
	referrer: z.string().max(2048).optional().nullable(),
	utm_source: z.string().max(200).optional(),
	utm_medium: z.string().max(200).optional(),
	utm_campaign: z.string().max(500).optional(),
	utm_term: z.string().max(500).optional(),
	utm_content: z.string().max(500).optional(),
	screen_w: z.number().int().positive().optional(),
	screen_h: z.number().int().positive().optional(),
	outbound_url: z.url().max(2048).optional(),
	name: z.string().min(1).max(200).optional(),
	props: z.record(z.string(), z.unknown()).optional(),
	identify: z.string().min(1).max(256).optional(),
});

export type CollectRequest = z.infer<typeof collectRequestSchema>;
