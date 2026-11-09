<script setup lang="ts">
useHead({ title: "Unsubscribe from a Digest" });

const route = useRoute();
const notify = useNotify();
const token = computed(() => (typeof route.query.token === "string" ? route.query.token : ""));
const pending = ref(false);
const unsubscribedFrom = ref<string>();

async function unsubscribe() {
	pending.value = true;
	try {
		const { siteName } = await $fetch<{ siteName: string }>("/api/digests/unsubscribe", { method: "POST", body: { token: token.value } });
		unsubscribedFrom.value = siteName;
	}
	catch (caught) {
		notify.error("Could not unsubscribe", caught);
	}
	pending.value = false;
}
</script>

<template>
	<AuthCard
		title="Unsubscribe from a Digest"
		:description="unsubscribedFrom ? undefined : 'Stop the Digest emails of this Site. Your other Digests stay as they are.'"
	>
		<UAlert
			v-if="unsubscribedFrom"
			color="success"
			variant="subtle"
			icon="i-material-symbols-unsubscribe-outline-rounded"
			:title="`You no longer get Digests of ${unsubscribedFrom}.`"
			description="Choose Digests again any time under Settings → Digests."
		/>
		<UAlert
			v-else-if="!token"
			color="warning"
			variant="subtle"
			icon="i-material-symbols-link-off-rounded"
			title="This link is incomplete. Use the Unsubscribe link in the Digest email."
		/>
		<UButton
			v-else
			label="Unsubscribe"
			icon="i-material-symbols-unsubscribe-outline-rounded"
			block
			:loading="pending"
			@click="unsubscribe"
		/>
		<UButton
			label="Open the dashboard"
			to="/app"
			color="neutral"
			variant="ghost"
			block
		/>
	</AuthCard>
</template>
