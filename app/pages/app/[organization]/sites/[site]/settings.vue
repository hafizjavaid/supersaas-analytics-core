<script setup lang="ts">
const { site, basePath } = useSite();
const sections = computed(() => siteSettingsSections(`${basePath.value}/settings`));
</script>

<template>
	<AppPanel id="site-settings">
		<template #title>
			<div class="flex min-w-0 items-center gap-2">
				<DashboardSourceIcon :domain="site.domain" />
				<span class="truncate">{{ site.name }}</span>
				<span class="font-normal text-muted">/ Settings</span>
			</div>
		</template>
		<AppSettingsShell :sections="sections">
			<NuxtPage />
		</AppSettingsShell>
	</AppPanel>
</template>
