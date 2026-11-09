<script setup lang="ts">
const { basePath } = useOrganization();
const { email } = useDeployment();
const sections = computed(() => organizationSettingsSections(`${basePath.value}/settings`, { email: email.value }));
</script>

<template>
	<AppPanel
		id="organization-settings"
		title="Settings"
	>
		<AppSettingsShell :sections="sections">
			<NuxtPage />
		</AppSettingsShell>
	</AppPanel>
</template>
