<script setup lang="ts">
import type { Journeys } from "#layers/core/shared/types/analytics";
import type { JourneyGroup } from "#layers/core/shared/utils/journeys";
import { parseJourneyPath } from "#layers/core/shared/utils/journeys";

const route = useRoute();
const { site, api } = useSite();
const { range, reportQuery, selectRange, selectCustomRange } = useDashboardQuery();
const live = useLiveVisitors(api);

const path = computed(() => parseJourneyPath(route.query.path));
const { data: journeys, status } = useSiteReport<Journeys>("journeys", api, () => journeyQuery(reportQuery.value, path.value));

function select(column: number, node: string) {
	const next = selectJourneyNode(path.value, column, node);
	const { path: _path, ...rest } = route.query;
	return navigateTo({ query: next.length > 0 ? { ...rest, path: next } : rest });
}

const expanded = ref(new Set<string>());

function isExpanded(group: JourneyGroup) {
	return group.selected || expanded.value.has(group.segment);
}

function toggle(group: JourneyGroup) {
	const next = new Set(expanded.value);
	if (!next.delete(group.segment)) {
		next.add(group.segment);
	}
	expanded.value = next;
}

// A group holding only its own page is shown as that page, with nothing to expand.
const isSinglePage = (group: JourneyGroup) => group.nodes.length === 1 && group.nodes[0]!.path === group.segment;
</script>

<template>
	<AppPanel id="site-journeys">
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

		<div class="mx-auto flex w-full max-w-7xl flex-col gap-4">
			<div>
				<h1 class="text-lg font-semibold text-highlighted">
					Journeys
				</h1>
				<p class="text-sm text-muted">
					Where Visitors start and which pages they open next. Select a page to follow them one step further.
				</p>
			</div>

			<DashboardFilterBar />

			<UCard :ui="{ body: 'p-0 sm:p-0' }">
				<div
					v-if="journeys && journeys.visitors === 0 && journeys.path.length === 0"
					class="flex flex-col items-center gap-3 py-16 text-center"
				>
					<UIcon
						name="i-material-symbols-account-tree-outline-rounded"
						class="size-8 text-dimmed"
					/>
					<p class="text-sm text-muted">
						No Visitors in this Range
					</p>
				</div>

				<div
					v-else-if="journeys"
					class="flex overflow-x-auto"
					aria-label="Journey columns"
				>
					<section
						class="flex w-72 shrink-0 flex-col gap-1 border-r border-default p-3"
						:aria-label="journeyColumnTitle(0)"
					>
						<h2 class="flex items-baseline justify-between px-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
							{{ journeyColumnTitle(0) }}
							<span class="tabular-nums normal-case">{{ journeys.visitors.toLocaleString("en-US") }} Visitors</span>
						</h2>
						<template
							v-for="group in journeys.startingPoints"
							:key="group.segment"
						>
							<DashboardJourneyNode
								v-if="isSinglePage(group)"
								:path="group.segment"
								:visitors="group.visitors"
								:column-visitors="journeys.visitors"
								:selected="group.selected"
								@select="select(0, group.segment)"
							/>
							<div
								v-else
								class="flex flex-col gap-0.5"
							>
								<button
									type="button"
									class="flex h-8 items-center gap-1.5 rounded-md px-2 text-left text-sm text-muted hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary"
									:aria-expanded="isExpanded(group)"
									:title="isExpanded(group) ? `Collapse ${group.segment}` : `Expand ${group.segment}`"
									@click="toggle(group)"
								>
									<UIcon
										:name="isExpanded(group) ? 'i-material-symbols-keyboard-arrow-down-rounded' : 'i-material-symbols-chevron-right-rounded'"
										class="size-4 shrink-0"
									/>
									<span class="min-w-0 flex-1 truncate font-mono text-xs">{{ group.segment }}/…</span>
									<span class="shrink-0 font-medium text-highlighted tabular-nums">{{ group.visitors.toLocaleString("en-US") }}</span>
									<span class="w-9 shrink-0 text-right text-xs tabular-nums">{{ journeyShare(group.visitors, journeys.visitors) }}</span>
								</button>
								<div
									v-if="isExpanded(group)"
									class="ml-3 flex flex-col gap-0.5 border-l border-default pl-2"
								>
									<DashboardJourneyNode
										v-for="node in group.nodes"
										:key="node.path"
										v-bind="node"
										:column-visitors="journeys.visitors"
										@select="select(0, node.path)"
									/>
								</div>
							</div>
						</template>
					</section>

					<section
						v-for="column in journeys.steps"
						:key="column.step"
						class="flex w-72 shrink-0 flex-col gap-1 border-r border-default p-3"
						:aria-label="journeyColumnTitle(column.step)"
					>
						<h2 class="flex items-baseline justify-between px-2 pb-1 text-xs font-medium tracking-wide text-muted uppercase">
							{{ journeyColumnTitle(column.step) }}
							<span class="tabular-nums normal-case">{{ column.visitors.toLocaleString("en-US") }} Visitors</span>
						</h2>
						<DashboardJourneyNode
							v-for="node in column.nodes"
							:key="node.path"
							v-bind="node"
							:column-visitors="column.visitors"
							@select="select(column.step, node.path)"
						/>
						<div
							class="flex h-8 shrink-0 items-center gap-2 rounded-md px-2 text-sm text-muted"
							title="Visitors who left after the previous page"
						>
							<UIcon
								name="i-material-symbols-logout-rounded"
								class="size-4 shrink-0 text-dimmed"
							/>
							<span class="min-w-0 flex-1 truncate">No further action</span>
							<span class="shrink-0 font-medium text-highlighted tabular-nums">{{ column.exits.toLocaleString("en-US") }}</span>
							<span class="w-9 shrink-0 text-right text-xs tabular-nums">{{ journeyShare(column.exits, column.visitors) }}</span>
						</div>
					</section>

					<p
						v-if="journeys.path.length === 0"
						class="flex min-w-48 flex-1 items-center justify-center p-6 text-center text-sm text-muted"
					>
						Select a starting point to see where Visitors went next.
					</p>
				</div>

				<USkeleton
					v-else-if="status === 'pending' || status === 'idle'"
					class="m-3 h-72"
				/>
				<p
					v-else
					class="p-6 text-sm text-muted"
				>
					Could not load the journeys.
				</p>
			</UCard>

			<UCard
				v-if="journeys?.events"
				:ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-2 sm:p-2' }"
			>
				<template #header>
					<h2 class="font-medium text-highlighted">
						Events on <span class="font-mono text-sm">{{ journeys.events.path }}</span>
					</h2>
					<p class="text-xs text-muted">
						Fired by the Visitors on this step before they moved on.
					</p>
				</template>
				<p
					v-if="journeys.events.rows.length === 0"
					class="px-2 py-4 text-sm text-muted"
				>
					No Events on this step
				</p>
				<ul
					v-else
					class="flex flex-col"
				>
					<li
						v-for="row in journeys.events.rows"
						:key="row.name"
						class="flex h-8 items-center gap-2 rounded-md px-2 text-sm"
					>
						<UIcon
							name="i-material-symbols-bolt-outline-rounded"
							class="size-4 shrink-0 text-dimmed"
						/>
						<span class="min-w-0 flex-1 truncate text-highlighted">{{ row.name }}</span>
						<span class="shrink-0 text-xs text-muted tabular-nums">{{ row.visitors.toLocaleString("en-US") }} Visitors</span>
						<span class="w-12 shrink-0 text-right font-medium text-highlighted tabular-nums">{{ row.count.toLocaleString("en-US") }}</span>
					</li>
				</ul>
			</UCard>
		</div>
	</AppPanel>
</template>
