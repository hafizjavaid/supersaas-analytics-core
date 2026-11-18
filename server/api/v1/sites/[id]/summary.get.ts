import { readApiV1Summary } from "#layers/core/server/utils/api-v1-reports";

export default defineEventHandler(async (event) => {
	const { site, range, filters } = await requireApiV1SiteAndRange(event);
	return await readApiV1Summary(site, range, filters);
});
