<script setup lang="ts">
import type { SharedDashboard } from "#layers/core/shared/types/analytics";

definePageMeta({ layout: false });
// The token is the whole secret, so it must not leave in a Referer header when a viewer follows a link.
useHead({ meta: [{ name: "referrer", content: "no-referrer" }] });

const route = useRoute();
const token = String(route.params.token);
const api = `/api/share/${encodeURIComponent(token)}`;
// Passed only on the first load, so the server counts one Badge click per page load.
const { data, error, refresh } = await useFetch<SharedDashboard>(api, { key: `share:${token}`, query: route.query.ref === "badge" ? { ref: "badge" } : {} });
if (error.value || !data.value) {
	throw createError({ statusCode: 404, statusMessage: "Share link not found", fatal: true });
}
</script>

<template>
	<ShareOutboundLinkView
		v-if="data && !data.locked && data.outboundUrl"
		:site="data.site"
		:api="api"
		:url="data.outboundUrl"
	/>
	<ShareScope
		v-else-if="data && !data.locked"
		:site="data.site"
		:api="api"
		:base-path="`/share/${token}`"
	/>
	<ShareUnlockForm
		v-else
		:api="api"
		@unlocked="refresh()"
	/>
</template>
