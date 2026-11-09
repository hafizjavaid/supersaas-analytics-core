<script setup lang="ts">
import type { EventProperties, TopEventRow } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; query: ReportQuery; event: TopEventRow }>();
const open = defineModel<boolean>("open", { default: false });

const { addFilters } = useDashboardQuery();
const allPages = ref(false);
watch(() => props.event, () => {
	allPages.value = false;
});

const breakdownQuery = computed(() => ({
	...props.query,
	name: props.event.name,
	...(allPages.value ? {} : { path: props.event.path ?? "" }),
}));
const { data, status } = useSiteReport<EventProperties>("event-properties", () => props.api, breakdownQuery);
const current = computed(() => {
	const breakdown = data.value;
	return breakdown?.name === props.event.name && breakdown.path === (allPages.value ? null : (props.event.path ?? "")) ? breakdown : undefined;
});

function share(count: number, total: number) {
	return total > 0 ? Math.round((count / total) * 100) : 0;
}

function filterByEvent() {
	open.value = false;
	addFilters([{ dimension: "event", value: props.event.name }]);
}
</script>

<template>
	<USlideover
		v-model:open="open"
		:title="event.name"
		description="Event properties by key and value"
	>
		<template #body>
			<div class="grid gap-5">
				<div class="flex flex-wrap items-center gap-1">
					<UButton
						:label="event.path ?? 'No page'"
						:aria-pressed="!allPages"
						size="xs"
						color="neutral"
						:variant="allPages ? 'ghost' : 'soft'"
						class="font-mono"
						@click="allPages = false"
					/>
					<UButton
						label="All pages"
						:aria-pressed="allPages"
						size="xs"
						color="neutral"
						:variant="allPages ? 'soft' : 'ghost'"
						@click="allPages = true"
					/>
					<UButton
						label="Filter dashboard"
						icon="i-material-symbols-filter-alt-outline"
						size="xs"
						color="neutral"
						variant="outline"
						class="ml-auto"
						@click="filterByEvent"
					/>
				</div>

				<p
					v-if="status === 'error'"
					class="text-sm text-muted"
				>
					Could not load the properties.
				</p>

				<div
					v-else-if="!current"
					class="grid gap-2"
				>
					<USkeleton
						v-for="index in 4"
						:key="index"
						class="h-7 w-full"
					/>
				</div>

				<template v-else>
					<p class="text-sm text-muted">
						<span class="font-medium text-highlighted tabular-nums">{{ current.count.toLocaleString("en-US") }}</span>
						{{ current.count === 1 ? "time" : "times" }} in this Range
					</p>

					<p
						v-if="current.properties.length === 0"
						class="text-sm text-muted"
					>
						No properties were sent with this Event.
					</p>

					<section
						v-for="property in current.properties"
						:key="property.key"
						class="grid gap-1"
					>
						<div class="flex items-baseline justify-between gap-2 text-xs">
							<span class="truncate font-mono font-medium text-highlighted">{{ property.key }}</span>
							<span class="text-muted tabular-nums">{{ property.count.toLocaleString("en-US") }}</span>
						</div>
						<div
							v-for="value in property.values"
							:key="value.value"
							class="relative flex h-7 items-center gap-2 rounded-md px-2 text-sm text-muted"
						>
							<div
								class="absolute inset-y-0 left-0 rounded-md bg-primary/10"
								:style="{ width: `${Math.max(3, share(value.count, property.count))}%` }"
							/>
							<span class="relative min-w-0 flex-1 truncate">{{ value.value }}</span>
							<span class="relative font-medium text-highlighted tabular-nums">{{ value.count.toLocaleString("en-US") }}</span>
							<span class="relative w-9 text-right text-xs tabular-nums">{{ share(value.count, property.count) }}%</span>
						</div>
					</section>
				</template>
			</div>
		</template>
	</USlideover>
</template>
