// https://nuxt.com/docs/api/configuration/nuxt-config
import { fileURLToPath } from "node:url";
import vue from "@vitejs/plugin-vue";

export default defineNuxtConfig({
	modules: ["@nuxt/eslint", "@nuxt/ui", "@vueuse/nuxt", "@nuxthub/core", "nuxt-echarts", "@comark/nuxt"],

	$development: {

		hub: {
			db: {
				dialect: "sqlite",
				casing: "snake_case",
			},
			kv: {
				driver: "fs",
				base: ".data/kv",
			},
			blob: {
				driver: "fs",
				dir: ".data/blob",
			},
			cache: {
				driver: "fs",
				base: ".data/cache",
			},
		}, vite: {
			optimizeDeps: {
				include: ["better-auth/client", "better-auth/client/plugins", "better-auth/plugins/access", "@comark/vue", "ai", "@ai-sdk/vue"],
			},
		},
	},

	// Names the `#layers/core/` alias, which core imports through so its paths hold when an app extends it.
	$meta: {
		name: "core",
	},

	$production: {
		hub: {
			db: {
				dialect: "sqlite",
				casing: "snake_case",
				// When we deploy to CF and want to use D1, CF KV and CF R2, and use DB binding we don't need to set the turso token in CF, but we need when we deploy to vercel
				driver: process.env.TURSO_AUTH_TOKEN ? "libsql" : "d1",
			},
			kv: true,
			blob: true,
			cache: true,
		},
	},

	// The server tests run their own dev server against a separate database and build output.
	...(process.env.NUXT_TEST_SERVER === "true" && {
		buildDir: ".nuxt-test",
		hub: {
			dir: ".data/test",
		},
	}),

	devtools: {
		enabled: true,
	},

	app: {
		head: {
			script: [
				{
					"src": "https://supersaasanalytics.com/sd.js",
					"defer": true,
					"data-site": "3f3167fe-5094-4ed4-bde6-18bcd9a1c5c6",
				},
			],
		},
	},

	css: [fileURLToPath(new URL("./app/assets/css/main.css", import.meta.url))],

	runtimeConfig: {
		auth: {
			url: "",
			secret: "",
			googleClientId: "",
			googleClientSecret: "",
			githubClientId: "",
			githubClientSecret: "",
		},
		email: {
			from: "hafiz@supersaas.dev",
			// Used when RESEND_API_TOKEN is unset.
			smtpHost: "",
			smtpPort: "587",
			smtpUsername: "",
			smtpPassword: "",
		},
		revenue: {
			// Replace Polar's and Stripe's API origins for the Sites' own connections; the server tests point them at stand-ins.
			polarApiUrl: "",
			stripeApiUrl: "",
		},
		searchConsole: {
			// The OAuth client with the webmasters.readonly scope. Empty uses the sign-in client (auth.google*).
			googleClientId: "",
			googleClientSecret: "",
			// Replace Google's and Bing's endpoints; the server tests point them at a stand-in.
			googleOauthUrl: "",
			googleTokenUrl: "",
			googleApiUrl: "",
			bingApiUrl: "",
		},
		anthropic: {
			// Without it the AI features are hidden. Self-hosted copies use their own key.
			apiKey: "",
			// Replaces the API origin (with /v1); the server tests point it at a stand-in.
			apiUrl: "",
		},
		public: {
			appName: "Supersaas Analytics",
			contactEmail: "hafiz@supersaasanalytics.com",
			trackerOrigin: "",
		},
	},

	routeRules: {
		"/sd.js": {
			headers: {
				"cache-control": "public, max-age=3600",
				"access-control-allow-origin": "*",
			},
		},
	},

	devServer: {
		port: 3001,
	},

	compatibilityDate: "2026-06-30",

	nitro: {
		// Compiles the Vue Email templates for server code. Its types follow Vite's rolldown, but Nitro's rollup runs it fine.
		rollupConfig: {
			plugins: [vue() as never],
		},
		experimental: {
			tasks: true,
		},
		// Keep in step with `triggers.crons` in core's and hosted's wrangler.jsonc, which wake the Worker for it.
		scheduledTasks: {
			"10 0 * * *": ["rollup:daily"],
			// After the Rollup, which Digests read their days from.
			"40 0 * * *": ["digests:send"],
			"25 * * * *": ["search:sync"],
		},
	},

	echarts: {
		renderer: "canvas",
		charts: ["LineChart", "BarChart"],
		components: ["GridComponent", "TooltipComponent", "AxisPointerComponent", "AriaComponent"],
	},

	eslint: {
		config: {
			stylistic: {
				semi: true,
				quotes: "double",
				commaDangle: "always-multiline",
				indent: "tab",
			},
		},
	},

	fonts: {
		families: [
			// The marketing display face (themes/marketing.css). Subsetted faces are not preloaded by default.
			{ name: "Nunito", weights: ["400 900"], subsets: ["latin"], preload: true },
		],
	},
});
