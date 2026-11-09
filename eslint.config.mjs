// @ts-check
import withNuxt from "./.nuxt/eslint.config.mjs";
import betterTailwindcss from "eslint-plugin-better-tailwindcss";
import { getDefaultAttributes } from "eslint-plugin-better-tailwindcss/api/defaults";

export default withNuxt(
	{
		ignores: ["public/sd.js"],
	},
	betterTailwindcss.configs["correctness-error"],
	{
		settings: {
			"better-tailwindcss": {
				entryPoint: "app/assets/css/main.css",
				attributes: [
					...getDefaultAttributes(),
					["^v-bind:ui$", [{ match: "objectValues" }]],
				],
			},
		},
	},
	{
		files: ["**/*.vue"],
		rules: {
			"vue/no-multiple-template-root": "off",
			"vue/multi-word-component-names": "off",
		},
	},
	{
		files: ["**/*.{js,ts,vue}"],
		rules: {
			"@typescript-eslint/no-explicit-any": "off",
		},
	},
);
