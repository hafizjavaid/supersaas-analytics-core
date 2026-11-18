import { readApiV1Live } from "#layers/core/server/utils/api-v1-reports";

export default defineEventHandler(async event => await readApiV1Live(await requireApiV1Site(event)));
