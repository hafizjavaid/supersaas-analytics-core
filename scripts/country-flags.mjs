// Serves the flags from our own origin: api.iconify.design is blocked on some networks.
import { mkdirSync, writeFileSync } from "node:fs";
import { icons } from "@iconify-json/circle-flags";
import { getIconData, iconToHTML, iconToSVG } from "@iconify/utils";

const outDir = new URL("../public/flags/", import.meta.url);
mkdirSync(outDir, { recursive: true });

const countryCodes = [...Object.keys(icons.icons), ...Object.keys(icons.aliases ?? {})]
	.filter(name => /^[a-z]{2}$/.test(name));

for (const code of countryCodes) {
	const { attributes, body } = iconToSVG(getIconData(icons, code));
	writeFileSync(new URL(`${code}.svg`, outDir), iconToHTML(body, attributes));
}
console.log(`Wrote ${countryCodes.length} flags to public/flags/`);
