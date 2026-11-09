<script setup lang="ts">
import type { Site } from "#layers/core/shared/types/analytics";

useHead({ title: "All sites" });

const { basePath, can } = useOrganization();
const { data: overview, refresh } = await useAllSitesOverview();
const canCreate = computed(() => can({ site: ["create"] }));
const addSiteOpen = ref(false);
const totalCells = computed(() => overviewTotalCells(overview.value.totals));
const TOTAL_GRID_COLUMNS: Record<number, string> = { 4: "sm:grid-cols-4", 5: "sm:grid-cols-3 lg:grid-cols-5" };

async function onSiteCreated(site: Site) {
	await refresh();
	await navigateTo(`${basePath.value}/sites/${site.id}/settings`);
}
</script>

<template>
	<AppPanel
		id="sites"
		title="All your sites"
	>
		<template
			v-if="canCreate && overview.sites.length"
			#right
		>
			<UButton
				label="Add a website"
				icon="i-material-symbols-add-rounded"
				@click="addSiteOpen = true"
			/>
		</template>

		<UEmpty
			v-if="!overview.sites.length"
			icon="i-material-symbols-bar-chart-rounded"
			title="No websites yet"
			:description="canCreate ? 'Add a website to start tracking its visitors.' : 'An Owner or Admin of this Organization can add one.'"
			:actions="canCreate ? [{ label: 'Add a website', icon: 'i-material-symbols-add-rounded', onClick: () => { addSiteOpen = true; } }] : []"
			class="m-auto max-w-sm"
		/>

		<div
			v-else
			class="flex flex-col gap-4"
		>
			<UCard
				:ui="{ body: 'p-2.5 sm:p-2.5' }"
				aria-label="All sites in the last 24 hours"
			>
				<div
					class="grid grid-cols-2 gap-1"
					:class="TOTAL_GRID_COLUMNS[totalCells.length] ?? 'sm:grid-cols-3'"
				>
					<div
						v-for="cell in totalCells"
						:key="cell.key"
						class="px-3 py-2"
					>
						<p class="flex items-center gap-1.5 text-sm text-muted">
							<span
								v-if="cell.key === 'live'"
								class="size-2 rounded-full"
								:class="overview.totals.live > 0 ? 'bg-success' : 'bg-accented'"
							/>
							{{ cell.label }}
							<span
								v-if="cell.period"
								class="hidden sm:inline"
							>· {{ cell.period }}</span>
						</p>
						<p class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<span class="text-2xl font-semibold tabular-nums text-highlighted">{{ cell.value }}</span>
							<span
								v-if="cell.change"
								class="rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
								:class="CHANGE_PILL_CLASSES[cell.change.tone]"
								:title="cell.period === '28d' ? 'Change against the 28 days before' : 'Change against the 24 hours before'"
							>{{ cell.change.label }}</span>
							<ULink
								v-if="cell.key === 'live'"
								:to="`${basePath}/live`"
								class="text-xs text-primary hover:underline"
							>
								View live →
							</ULink>
						</p>
					</div>
				</div>
			</UCard>

			<SiteOverviewBand
				v-for="entry in overview.sites"
				:key="entry.site.id"
				:entry="entry"
				:to="`${basePath}/sites/${entry.site.id}`"
			/>
		</div>

		<DashboardAddSiteModal
			v-model:open="addSiteOpen"
			@created="onSiteCreated"
		/>
	</AppPanel>
</template>
