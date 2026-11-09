import { z } from "zod";
import { invitableRoles } from "../utils/permissions";

export const transferOwnershipSchema = z.object({
	memberId: z.string().min(1),
});

// These sit beside `/app/[organization]`, so an Organization with one of these slugs would be unreachable.
export const reservedOrganizationSlugs = ["admin", "onboard", "new", "settings", "account", "invitations"];

export const organizationSlugSchema = z.string()
	.trim()
	.min(2, "Use at least 2 characters")
	.max(48)
	.regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and single dashes")
	.refine(slug => !reservedOrganizationSlugs.includes(slug), "This URL is reserved");

export const createOrganizationSchema = z.object({
	name: z.string().trim().min(1, "Name is required").max(80),
	slug: organizationSlugSchema,
});

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>;

export const inviteMemberSchema = z.object({
	email: z.string().trim().toLowerCase().pipe(z.email("Enter a valid email")),
	role: z.enum(invitableRoles),
});

export type InviteMemberInput = z.infer<typeof inviteMemberSchema>;
