export default defineEventHandler(async event => listSearchProperties((await requireSearchConnection(event)).connection));
