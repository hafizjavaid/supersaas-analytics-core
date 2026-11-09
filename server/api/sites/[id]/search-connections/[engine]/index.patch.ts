import { chooseSearchProperty } from "#layers/core/server/db/queries/search";
import { searchPropertySchema } from "#layers/core/shared/schemas/search";

export default defineEventHandler(async (event) => {
	const { site, connection } = await requireSearchConnection(event);
	const parsed = searchPropertySchema.safeParse(await readBody(event).catch(() => null));
	if (!parsed.success) {
		throw createError({ statusCode: 400, statusMessage: "Validation failed", data: { issues: parsed.error.issues } });
	}
	const properties = await listSearchProperties(connection);
	if (!properties.some(property => property.id === parsed.data.property)) {
		throw createError({ statusCode: 400, statusMessage: "Unknown property", message: "This account cannot read that property." });
	}
	const chosen = await chooseSearchProperty(connection, parsed.data.property);
	startSearchSync(event, site.id, connection.engine);
	return searchConnectionOf(chosen);
});
