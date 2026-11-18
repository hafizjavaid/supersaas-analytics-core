import { z } from "zod";

export const MIN_SHARE_PASSWORD_LENGTH = 8;

const sharePasswordSchema = z.string().max(200).optional().transform(password => password || undefined)
	.refine(password => password === undefined || password.length >= MIN_SHARE_PASSWORD_LENGTH, `Use at least ${MIN_SHARE_PASSWORD_LENGTH} characters`);

export const createShareLinkSchema = z.object({
	name: z.string().trim().min(1, "Enter a name").max(100),
	password: sharePasswordSchema,
	outboundUrl: z.url({ protocol: /^https?$/, error: "Enter a web address" }).max(2048).optional(),
});

export type CreateShareLinkInput = z.infer<typeof createShareLinkSchema>;

export const updateShareLinkSchema = z.object({
	badge: z.boolean().optional(),
	password: sharePasswordSchema,
}).refine(change => change.badge !== undefined || change.password !== undefined, "Change the Badge or the password");

export type UpdateShareLinkInput = z.infer<typeof updateShareLinkSchema>;

export const unlockShareLinkSchema = z.object({
	password: z.string().min(1).max(200),
});
