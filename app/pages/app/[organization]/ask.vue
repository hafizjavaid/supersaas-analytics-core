<script setup lang="ts">
useHead({ title: "Ask AI" });

const { organization } = useOrganization();
const { ai } = useDeployment();
</script>

<template>
	<AppPanel
		id="organization-ask"
		title="Ask AI"
	>
		<AiChat
			v-if="ai"
			:subject="`all of ${organization.name}'s sites`"
		/>
		<AiUnavailable v-else />
	</AppPanel>
</template>
