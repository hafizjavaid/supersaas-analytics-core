export default defineEventHandler(event => serverAuth().handler(toWebRequest(event)));
