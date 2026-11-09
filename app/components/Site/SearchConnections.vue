<script setup lang="ts">
import type { SearchConnections } from "#layers/core/shared/types/search";

const props = defineProps<{ siteId: string; editable: boolean }>();

const route = useRoute();
const notify = useNotify();
const { data, refresh } = await useFetch<SearchConnections>(() => `/api/sites/${props.siteId}/search-connections`, {
	key: `search-connections:${props.siteId}`,
	immediate: props.editable,
	default: () => ({ google: null, bing: null, googleAvailable: false }),
});

const authorizeUrl = computed(() => `/api/sites/${props.siteId}/search-connections/google/authorize`);

const bingApiKey = ref("");
const connectingBing = ref(false);

async function connectBing() {
	connectingBing.value = true;
	try {
		await $fetch(`/api/sites/${props.siteId}/search-connections/bing`, { method: "PUT", body: { apiKey: bingApiKey.value } });
		notify.success("Bing connected", "Pick the Bing site for this Site.");
		bingApiKey.value = "";
		await refresh();
	}
	catch (caught) {
		notify.error("Could not connect Bing", caught);
	}
	finally {
		connectingBing.value = false;
	}
}

const GOOGLE_ERRORS: Record<string, string> = {
	denied: "Search Console access was not granted.",
	google: "Google refused the connection. Try again.",
};

// The OAuth callback returns here with the outcome in the query, shown once and then dropped from the URL.
onMounted(() => {
	const { searchConnected, searchError, ...rest } = route.query;
	if (searchConnected === "google") {
		notify.success("Google connected", "Pick the Search Console property for this Site.");
	}
	else if (typeof searchError === "string") {
		notify.error("Could not connect Search Console", null, GOOGLE_ERRORS[searchError] ?? GOOGLE_ERRORS.google);
	}
	if (searchConnected || searchError) {
		navigateTo({ query: rest }, { replace: true });
	}
});
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Search engines
			</h2>
			<p class="text-sm text-muted">
				Connect Google Search Console and Bing Webmaster Tools to see the searches that bring Visitors: clicks,
				impressions, CTR and position per keyword and page. Data is fetched every hour, starting with all the history
				each engine keeps.
			</p>
		</template>

		<p
			v-if="!editable"
			class="text-sm text-muted"
		>
			An Owner or Admin of this Organization can connect a search engine.
		</p>

		<div
			v-else
			class="flex flex-col gap-8"
		>
			<section
				aria-labelledby="google-search-console"
				class="flex flex-col gap-3"
			>
				<h3
					id="google-search-console"
					class="flex items-center gap-2 text-sm font-medium text-highlighted"
				>
					<UIcon
						name="i-logos-google-icon"
						class="size-4"
					/>
					Google Search Console
				</h3>
				<SiteSearchEngineConnection
					:site-id="siteId"
					engine="google"
					:connection="data.google"
					@changed="refresh"
				>
					<template #connect>
						<div
							v-if="data.googleAvailable"
							class="flex flex-wrap items-center justify-between gap-3"
						>
							<p class="text-sm text-muted">
								Sign in with a Google account that can read the website's Search Console property. Access is read-only.
							</p>
							<UButton
								label="Connect with Google"
								icon="i-logos-google-icon"
								color="neutral"
								variant="outline"
								:to="authorizeUrl"
								external
							/>
						</div>
						<p
							v-else
							class="text-sm text-muted"
						>
							Search Console needs a Google OAuth client on this server: set NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_ID and
							NUXT_SEARCH_CONSOLE_GOOGLE_CLIENT_SECRET.
							<ULink
								:to="hostedDocsUrl('integrations/search-console')"
								target="_blank"
								class="text-primary"
							>
								Read the guide
							</ULink>
						</p>
					</template>
					<template #reconnect>
						<UButton
							label="Connect again"
							size="sm"
							color="neutral"
							variant="outline"
							:to="authorizeUrl"
							external
						/>
					</template>
				</SiteSearchEngineConnection>
			</section>

			<section
				aria-labelledby="bing-webmaster"
				class="flex flex-col gap-3"
			>
				<h3
					id="bing-webmaster"
					class="flex items-center gap-2 text-sm font-medium text-highlighted"
				>
					<UIcon
						name="i-simple-icons-microsoftbing"
						class="size-4"
					/>
					Bing Webmaster Tools
				</h3>
				<SiteSearchEngineConnection
					:site-id="siteId"
					engine="bing"
					:connection="data.bing"
					@changed="refresh"
				>
					<template #connect>
						<form
							class="flex flex-col gap-2 sm:flex-row sm:items-end"
							@submit.prevent="connectBing"
						>
							<UFormField
								label="API key"
								help="In Bing Webmaster Tools, open Settings → API access and generate an API key. It is stored encrypted."
								class="flex-1"
							>
								<UInput
									v-model="bingApiKey"
									type="password"
									class="w-full font-mono"
									autocomplete="off"
								/>
							</UFormField>
							<UButton
								type="submit"
								label="Connect Bing"
								:loading="connectingBing"
								:disabled="!bingApiKey.trim()"
							/>
						</form>
					</template>
				</SiteSearchEngineConnection>
			</section>
		</div>
	</UCard>
</template>
