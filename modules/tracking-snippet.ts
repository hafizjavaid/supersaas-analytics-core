import { writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { defineNuxtModule } from "nuxt/kit";
import { minifyTrackingSnippet } from "../tracking-snippet/build";

// Writes core's own public/sd.js (git-ignored), which an app extending core serves too, on every `nuxt dev`, `build`
// and `prepare`, so it always matches tracking-snippet/sd.js.
export default defineNuxtModule({
	meta: { name: "sd-tracking-snippet" },
	async setup() {
		await writeFile(fileURLToPath(new URL("../public/sd.js", import.meta.url)), await minifyTrackingSnippet());
	},
});
