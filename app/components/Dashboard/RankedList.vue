<script setup lang="ts" generic="TItem extends { key: string; label: string; detail?: string | null; value: number; filters?: Filter[] }">
import type { Filter } from "#layers/core/shared/utils/filters";

const props = withDefaults(defineProps<{
	items: TItem[];
	total?: number;
	animate?: boolean;
	emptyLabel?: string;
	selectLabel?: string;
	format?: (value: number) => string;
}>(), {
	total: undefined,
	animate: false,
	emptyLabel: "No data yet",
	selectLabel: undefined,
	format: (value: number) => value.toLocaleString("en-US"),
});

const emit = defineEmits<{ select: [item: TItem] }>();

defineSlots<{ icon?: (props: { item: TItem }) => unknown }>();

const { addFilters } = useDashboardQuery();
const scroller = useTemplateRef("scroller");
const moreBelow = ref(false);
const renderVersion = ref(0);

const max = computed(() => Math.max(1, ...props.items.map(item => item.value)));
const denominator = computed(() => props.total ?? props.items.reduce((sum, item) => sum + item.value, 0));

function share(value: number) {
	return denominator.value > 0 ? Math.round((value / denominator.value) * 100) : 0;
}

function rowTitle(item: TItem) {
	if (props.selectLabel) {
		return `${props.selectLabel} ${item.label}`;
	}
	return item.filters ? `Filter by ${item.label}` : undefined;
}

function choose(item: TItem) {
	if (props.selectLabel) {
		emit("select", item);
	}
	else if (item.filters) {
		addFilters(item.filters);
	}
}

function updateFade() {
	const element = scroller.value;
	moreBelow.value = element ? element.scrollHeight - element.scrollTop - element.clientHeight > 4 : false;
}

watch(() => props.items, async () => {
	renderVersion.value += 1;
	await nextTick();
	updateFade();
});
useResizeObserver(scroller, updateFade);
</script>

<template>
	<div
		v-if="items.length === 0"
		class="flex h-72 items-center justify-center"
	>
		<p class="text-sm text-muted">
			{{ emptyLabel }}
		</p>
	</div>

	<div
		v-else
		class="relative"
	>
		<div
			ref="scroller"
			class="group flex h-72 flex-col gap-0.5 overflow-y-auto pr-1"
			@scroll.passive="updateFade"
		>
			<component
				:is="rowTitle(item) ? 'button' : 'div'"
				v-for="(item, index) in items"
				:key="`${renderVersion}-${item.key}`"
				:type="rowTitle(item) ? 'button' : undefined"
				:title="rowTitle(item)"
				class="relative flex h-7 shrink-0 items-center gap-2 rounded-md px-2 text-left text-sm text-muted"
				:class="{
					'ranked-list-enter': animate,
					'cursor-pointer transition-colors hover:bg-elevated/60 focus-visible:outline-2 focus-visible:outline-primary': rowTitle(item),
				}"
				:style="animate ? { animationDelay: `${index * 30}ms` } : undefined"
				@click="choose(item)"
			>
				<div
					class="absolute inset-y-0 left-0 rounded-md bg-primary/10"
					:style="{ width: `${Math.max(3, (item.value / max) * 100)}%` }"
				/>
				<div class="relative flex min-w-0 flex-1 items-center gap-2">
					<slot
						name="icon"
						:item="item"
					/>
					<span class="truncate tracking-wide">{{ item.label }}</span>
					<span
						v-if="item.detail"
						class="min-w-0 shrink-[2] truncate font-mono text-xs text-dimmed"
					>{{ item.detail }}</span>
				</div>
				<div class="relative flex shrink-0 items-center">
					<span class="font-medium text-highlighted tabular-nums">{{ format(item.value) }}</span>
					<span class="grid grid-cols-[0fr] overflow-hidden transition-[grid-template-columns] duration-100 ease-linear group-hover:grid-cols-[1fr]">
						<span class="overflow-hidden pl-1 text-xs whitespace-nowrap text-muted">· {{ share(item.value) }}%</span>
					</span>
				</div>
			</component>
		</div>
		<div
			aria-hidden="true"
			class="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-linear-to-t from-default to-transparent transition-opacity duration-200"
			:class="moreBelow ? 'opacity-100' : 'opacity-0'"
		/>
	</div>
</template>
