import { readApiV1TopList } from "#layers/core/server/utils/api-v1-reports";
import { TOP_LIST_DIMENSIONS } from "#layers/core/shared/utils/ai";
import type { TopListDimension } from "#layers/core/shared/utils/ai";

function isTopListDimension(value: string | undefined): value is TopListDimension {
	return TOP_LIST_DIMENSIONS.includes(value as TopListDimension);
}

export default defineEventHandler(async (event) => {
	const { site, range, filters } = await requireApiV1SiteAndRange(event);
	const dimension = getRouterParam(event, "dimension");
	if (!isTopListDimension(dimension)) {
		throw createError({ statusCode: 404, statusMessage: "Unknown Dimension", message: `Dimensions: ${TOP_LIST_DIMENSIONS.join(", ")}` });
	}
	return await readApiV1TopList(site, range, filters, dimension);
});
