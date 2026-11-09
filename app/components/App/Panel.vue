<script setup lang="ts">
defineProps<{ id: string; title?: string }>();

const route = useRoute();
const hasSidebar = route.meta.layout === "dashboard" || hasSharedSite();
const onShareLink = route.path.startsWith("/share/");
</script>

<template>
	<UDashboardPanel :id="id">
		<template #header>
			<UDashboardNavbar
				:title="title"
				:ui="{ left: 'min-w-0 flex-1', right: 'gap-1' }"
			>
				<template
					v-if="hasSidebar"
					#leading
				>
					<UDashboardSidebarCollapse />
				</template>
				<template
					v-if="$slots.title"
					#title
				>
					<slot name="title" />
				</template>
				<template
					v-if="$slots.right"
					#right
				>
					<slot name="right" />
				</template>
			</UDashboardNavbar>
			<AppPanelNotice />
		</template>
		<template #body>
			<slot />
			<AppPoweredBy
				v-if="onShareLink"
				class="mt-auto self-center pt-4"
			/>
		</template>
	</UDashboardPanel>
</template>
