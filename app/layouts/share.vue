<script setup lang="ts">
const route = useRoute();
const { site, basePath } = useSharedSite();
const links = computed(() => withReportQuery(shareNavigation(basePath), route.query));

// Keyed on `data-collapsed`, which only the desktop sidebar carries, so the mobile menu keeps the full layout.
const sidebarUi = {
	header: "px-4 in-data-[collapsed=true]:justify-center in-data-[collapsed=true]:px-2",
	body: "px-4 in-data-[collapsed=true]:items-center in-data-[collapsed=true]:px-2",
	footer: "px-4 in-data-[collapsed=true]:flex-col in-data-[collapsed=true]:justify-center in-data-[collapsed=true]:px-2",
};
</script>

<template>
	<UDashboardGroup unit="rem">
		<UDashboardSidebar
			id="share"
			collapsible
			:collapsed-size="4"
			:default-size="15"
			:ui="sidebarUi"
		>
			<template #header="{ collapsed }">
				<div class="flex min-w-0 items-center gap-2 font-semibold text-highlighted">
					<span class="flex size-8 shrink-0 items-center justify-center bg-primary text-inverted">
						<UIcon
							name="i-material-symbols-bar-chart-rounded"
							class="size-5"
						/>
					</span>
					<span
						v-if="!collapsed"
						class="truncate"
					>{{ site.name }}</span>
				</div>
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
			</template>

			<template #footer="{ collapsed }">
				<UTooltip
					text="Theme"
					:content="{ side: 'right' }"
					:disabled="!collapsed"
				>
					<UColorModeButton color="neutral" />
				</UTooltip>
			</template>
		</UDashboardSidebar>

		<slot />
	</UDashboardGroup>
</template>
