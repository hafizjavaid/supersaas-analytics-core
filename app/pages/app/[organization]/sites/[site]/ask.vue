<script setup lang="ts">
useHead({ title: "Ask AI" });

const { site, api } = useSite();
const { ai } = useDeployment();
const live = useLiveVisitors(api);
</script>

<template>
	<AppPanel id="site-ask">
		<template #title>
			<SiteHeader
				:site="site"
				:live="live"
			/>
		</template>

		<AiChat
			v-if="ai"
			:key="site.id"
			:site-id="site.id"
			:subject="site.name"
		/>
		<AiUnavailable v-else />
	</AppPanel>
</template>
