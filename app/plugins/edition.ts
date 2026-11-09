export default defineNuxtPlugin({
	name: "edition",
	setup: () => ({ provide: { edition: coreEdition() } }),
});
