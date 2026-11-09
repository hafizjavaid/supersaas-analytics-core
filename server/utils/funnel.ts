import type { H3Event } from "h3";
import { funnelSchema } from "#layers/core/shared/schemas/funnels";

export async function readFunnelInput(event: H3Event) {
	const parsed = funnelSchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	return parsed.data;
}

export function funnelNotFound() {
	return createError({ statusCode: 404, statusMessage: "Funnel not found" });
}
