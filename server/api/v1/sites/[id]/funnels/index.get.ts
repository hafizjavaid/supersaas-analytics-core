import { readApiV1Funnels } from "#layers/core/server/utils/api-v1-reports";

export default defineEventHandler(async event => await readApiV1Funnels(await requireApiV1Site(event)));
