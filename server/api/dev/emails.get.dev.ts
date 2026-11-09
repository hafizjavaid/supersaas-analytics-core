export default defineEventHandler((event) => {
	const to = getQuery(event).to;
	const emails = listDevOutbox();
	return typeof to === "string" ? emails.filter(email => email.to === to.toLowerCase()) : emails;
});
