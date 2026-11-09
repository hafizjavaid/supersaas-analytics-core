<script setup lang="ts">
const route = useRoute();
const { ai } = useDeployment();
const { organizationNavigation, adminNavigation: adminLinks } = useEdition();
const { appName } = useRuntimeConfig().public;
const organizationSlug = computed(() => String(route.params.organization ?? ""));
const siteId = computed(() => route.params.site ? String(route.params.site) : undefined);
const homePath = computed(() => (organizationSlug.value ? `/app/${organizationSlug.value}` : "/app"));
const links = computed(() => {
	if (organizationSlug.value) {
		return withReportQuery(sidebarNavigation({ organizationSlug: organizationSlug.value, siteId: siteId.value, ai: ai.value, organizationLinks: organizationNavigation }), route.query);
	}
	return adminNavigation(adminLinks);
});

// Keyed on `data-collapsed`, which only the desktop sidebar carries, so the mobile menu keeps the full layout.
const sidebarUi = {
	header: "px-4 in-data-[collapsed=true]:justify-center in-data-[collapsed=true]:px-2",
	body: "px-4 in-data-[collapsed=true]:items-center in-data-[collapsed=true]:px-2",
	footer: "gap-1 px-4 in-data-[collapsed=true]:flex-col in-data-[collapsed=true]:justify-center in-data-[collapsed=true]:px-2",
};
</script>

<template>
	<UDashboardGroup unit="rem">
		<UDashboardSidebar
			id="app"
			collapsible
			:collapsed-size="4"
			:default-size="15"
			:ui="sidebarUi"
		>
			<template #header="{ collapsed }">
				<NuxtLink
					:to="homePath"
					class="flex items-center gap-2 font-semibold text-highlighted"
					aria-label="All sites"
				>
					<span class="flex size-8 items-center justify-center bg-primary text-inverted">
						<UIcon
							name="i-material-symbols-bar-chart-rounded"
							class="size-5"
						/>
					</span>
					<span v-if="!collapsed">{{ appName }}</span>
				</NuxtLink>
			</template>

			<template #default="{ collapsed }">
				<UNavigationMenu
					:items="links"
					:collapsed="collapsed"
					orientation="vertical"
					tooltip
					color="neutral"
					:class="collapsed ? 'w-10' : 'w-full'"
				/>
				<AppPoweredBy
					v-if="!collapsed"
					class="mt-auto"
				/>
			</template>

			<template #footer="{ collapsed }">
				<UTooltip
					text="Theme"
					:content="{ side: 'right' }"
					:disabled="!collapsed"
				>
					<UColorModeButton
						color="neutral"
						:class="{ 'order-last': !collapsed }"
					/>
				</UTooltip>
				<AppUserMenu :collapsed="collapsed" />
			</template>
		</UDashboardSidebar>

		<slot />
	</UDashboardGroup>
</template>
