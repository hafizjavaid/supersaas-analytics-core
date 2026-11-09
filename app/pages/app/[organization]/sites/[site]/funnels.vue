<script setup lang="ts">
import type { Funnel } from "#layers/core/shared/types/analytics";
import { MAX_FUNNELS_PER_SITE } from "#layers/core/shared/utils/funnels";

const { site, api, basePath } = useSite();
const { range, reportQuery, selectRange, selectCustomRange } = useDashboardQuery();
const { can } = useOrganization();
const live = useLiveVisitors(api);
const { data: funnels, status, refresh } = await useFunnels(api);

const canManage = computed(() => can({ funnel: ["create"] }));
const builderOpen = ref(false);
const editing = ref<Funnel | null>(null);

function openBuilder(funnel: Funnel | null) {
	editing.value = funnel;
	builderOpen.value = true;
}
</script>

<template>
	<AppPanel id="site-funnels">
		<template #title>
			<SiteHeader
				:site="site"
				:live="live"
			/>
		</template>
		<template #right>
			<DashboardRangePicker
				:range="range"
				@select="selectRange"
				@select-custom="selectCustomRange"
			/>
		</template>

		<div class="mx-auto flex w-full max-w-5xl flex-col gap-4">
			<div class="flex items-center justify-between gap-2">
				<div>
					<h1 class="text-lg font-semibold text-highlighted">
						Funnels
					</h1>
					<p class="text-sm text-muted">
						How many Visitors complete each step in order, and where the rest drop off.
					</p>
				</div>
				<UButton
					v-if="canManage && funnels.length < MAX_FUNNELS_PER_SITE"
					label="New funnel"
					icon="i-material-symbols-add-rounded"
					@click="openBuilder(null)"
				/>
			</div>

			<DashboardFilterBar />

			<UCard v-if="status !== 'pending' && funnels.length === 0">
				<div class="flex flex-col items-center gap-3 py-10 text-center">
					<UIcon
						name="i-material-symbols-conversion-path-rounded"
						class="size-8 text-dimmed"
					/>
					<p class="text-sm text-muted">
						No funnels yet.
						<template v-if="canManage">
							Add the pages and Events that lead to a signup or a sale.
						</template>
						<template v-else>
							Owners and Admins can create them.
						</template>
					</p>
					<UButton
						v-if="canManage"
						label="Create a funnel"
						icon="i-material-symbols-add-rounded"
						color="neutral"
						variant="outline"
						@click="openBuilder(null)"
					/>
				</div>
			</UCard>

			<div class="grid grid-cols-1 gap-4 lg:grid-cols-2">
				<DashboardFunnelCard
					v-for="funnel in funnels"
					:key="funnel.id"
					:api="api"
					:query="reportQuery"
					:funnel="funnel"
					:can-manage="canManage"
					:journeys-path="`${basePath}/journeys`"
					@edit="openBuilder"
				/>
			</div>
		</div>

		<DashboardFunnelBuilder
			v-if="canManage"
			v-model:open="builderOpen"
			:site-id="site.id"
			:query="reportQuery"
			:funnel="editing"
			@saved="refresh()"
			@deleted="refresh()"
		/>
	</AppPanel>
</template>
