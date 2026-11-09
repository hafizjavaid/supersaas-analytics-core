import { readFile } from "node:fs/promises";
import { minify } from "terser";

const source = new URL("./sd.js", import.meta.url);

export async function minifyTrackingSnippet(): Promise<string> {
	const { code } = await minify(await readFile(source, "utf8"), {
		ecma: 2020,
		toplevel: true,
		compress: { passes: 3, unsafe: true },
		format: { comments: false },
	});
	if (!code) {
		throw new Error("sd.js minified to nothing");
	}
	return code;
}
