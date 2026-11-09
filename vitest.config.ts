import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const alias = {
	"#layers/core": fileURLToPath(new URL(".", import.meta.url)),
};

export default defineConfig({
	test: {
		projects: [
			{
				resolve: { alias },
				test: {
					name: "unit",
					include: ["test/unit/**/*.test.ts"],
					environment: "node",
				},
			},
			{
				resolve: { alias },
				test: {
					name: "server",
					include: ["test/server/**/*.test.ts"],
					environment: "node",
					globalSetup: ["test/server/global-setup.ts"],
					fileParallelism: false,
					hookTimeout: 240_000,
					testTimeout: 30_000,
				},
			},
		],
	},
});
