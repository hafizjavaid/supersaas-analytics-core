import { z } from "zod";
import type { SignUpPolicy } from "#layers/core/shared/types/deployment";

const overridesSchema = z.object({
	signUps: z.enum(["open", "closed"] satisfies SignUpPolicy[]).optional(),
	email: z.boolean().optional(),
	googleSearchConsole: z.boolean().optional(),
});

export default defineEventHandler(async (event) => {
	overrideDeployment(await readValidatedBody(event, overridesSchema.parse));
	return deploymentStatus();
});
