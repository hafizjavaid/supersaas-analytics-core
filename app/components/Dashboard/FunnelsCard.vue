<script setup lang="ts">
import type { RouteLocationRaw } from "vue-router";

const props = defineProps<{ api: string; query: ReportQuery; funnelsTo: RouteLocationRaw; canManage: boolean }>();

const { data: funnels, status } = useFunnels(() => props.api);
const selectedId = ref<string>();
const selected = computed(() => funnels.value.find(funnel => funnel.id === selectedId.value) ?? funnels.value[0]);
const tabs = computed(() => funnels.value.slice(0, 4).map(funnel => ({ label: funnel.name, value: funnel.id })));
</script>

<template>
	<DashboardRankedCard
		title="Funnels"
		:tabs="tabs.length > 1 ? tabs : undefined"
		:view="selected?.id"
		:ui="{ body: 'p-4 sm:p-4' }"
		@change="(view: string) => selectedId = view"
	>
		<div
			v-if="status !== 'pending' && funnels.length === 0"
			class="flex flex-col items-center justify-center gap-3 py-10 text-center"
		>
			<p class="text-sm text-muted">
				No funnels yet. Follow Visitors through the steps that lead to a signup or a sale.
			</p>
			<UButton
				v-if="canManage"
				label="Create a funnel"
				icon="i-material-symbols-conversion-path-rounded"
				color="neutral"
				variant="outline"
				size="sm"
				:to="funnelsTo"
			/>
		</div>

		<div
			v-else-if="selected"
			class="flex flex-col gap-3"
		>
			<DashboardFunnelReport
				:key="selected.id"
				:api="api"
				:query="query"
				:funnel="selected"
			>
				<template #lead>
					<span class="font-medium text-default">{{ selected.name }}</span> ·
				</template>
			</DashboardFunnelReport>
			<ULink
				:to="funnelsTo"
				class="self-end text-xs text-muted hover:text-default"
			>
				All funnels →
			</ULink>
		</div>

		<USkeleton
			v-else
			class="h-32 w-full"
		/>
	</DashboardRankedCard>
</template>
