<script setup lang="ts">
import type { Realtime } from "#layers/core/shared/types/analytics";

const props = withDefaults(defineProps<{ realtime: Realtime; showSite?: boolean }>(), { showSite: false });

const hoveredVisitorId = ref<string | null>(null);
const focus = computed(() => props.realtime.visitors.find(visitor => visitor.id === hoveredVisitorId.value)?.coordinates ?? null);
</script>

<template>
	<div class="flex flex-col gap-4 lg:h-[calc(100dvh-var(--ui-header-height)-3rem)] lg:min-h-[32rem] lg:flex-row">
		<UCard
			class="flex min-h-0 flex-col lg:w-96 lg:shrink-0"
			:ui="{ body: 'flex min-h-0 flex-1 flex-col' }"
		>
			<DashboardRealtimePanel
				v-model:hovered="hoveredVisitorId"
				:realtime="realtime"
				:show-site="showSite"
				class="flex-1"
			/>
		</UCard>
		<UCard
			class="min-h-96 flex-1 overflow-hidden"
			:ui="{ body: 'h-full p-0 sm:p-0' }"
		>
			<DashboardLiveGlobe
				:count="realtime.count"
				:locations="realtime.locations"
				:focus="focus"
				hide-count
			/>
		</UCard>
	</div>
</template>
