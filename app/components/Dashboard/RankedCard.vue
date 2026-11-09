<script setup lang="ts" generic="TView extends string">
import type { DropdownMenuItem } from "@nuxt/ui";

const props = defineProps<{
	title: string;
	tabs?: DimensionTab<TView>[];
	moreTabs?: DimensionTab<TView>[];
	moreLabel?: string;
	view?: TView;
	ui?: { body?: string };
}>();

const emit = defineEmits<{ change: [view: TView, byPointer: boolean] }>();

const activeMoreTab = computed(() => props.moreTabs?.find(tab => tab.value === props.view));
const moreItems = computed<DropdownMenuItem[]>(() => (props.moreTabs ?? []).map(tab => ({
	label: tab.label,
	icon: tab.value === props.view ? "i-material-symbols-check-rounded" : undefined,
	onSelect: () => emit("change", tab.value, true),
})));
</script>

<template>
	<UCard :ui="{ header: 'px-4 py-2 sm:px-4', body: ui?.body ?? 'p-2.5 sm:p-2.5 h-full' }">
		<template #header>
			<div class="flex min-w-0 items-center justify-between gap-2">
				<span class="shrink-0 text-sm font-medium">{{ title }}</span>
				<div
					v-if="tabs"
					class="ml-auto flex min-w-0 shrink items-center gap-0.5 overflow-x-auto"
				>
					<UButton
						v-for="tab in tabs"
						:key="tab.value"
						:label="tab.label"
						:icon="tab.icon"
						:aria-label="tab.ariaLabel"
						:title="tab.ariaLabel"
						:aria-pressed="tab.value === view"
						size="xs"
						color="neutral"
						:variant="tab.value === view ? 'soft' : 'ghost'"
						:class="tab.value === view ? '' : 'opacity-50 hover:opacity-100'"
						@click="(event: MouseEvent) => emit('change', tab.value, event.detail !== 0)"
					/>
					<UDropdownMenu
						v-if="moreTabs?.length"
						:items="moreItems"
						:content="{ align: 'end' }"
					>
						<UButton
							:label="activeMoreTab?.label ?? moreLabel"
							:aria-pressed="!!activeMoreTab"
							trailing-icon="i-material-symbols-keyboard-arrow-down-rounded"
							size="xs"
							color="neutral"
							:variant="activeMoreTab ? 'soft' : 'ghost'"
							:class="activeMoreTab ? '' : 'opacity-50 hover:opacity-100'"
						/>
					</UDropdownMenu>
				</div>
			</div>
		</template>

		<slot />
	</UCard>
</template>
