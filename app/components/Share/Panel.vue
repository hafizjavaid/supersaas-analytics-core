<script setup lang="ts">
import type { LiveVisitors } from "#layers/core/shared/types/analytics";

defineProps<{ id: string; live?: LiveVisitors | null }>();

const { site } = useSharedSite();
const { range, selectRange, selectCustomRange } = useDashboardQuery();
</script>

<template>
	<AppPanel :id="id">
		<template #title>
			<SiteHeader
				:site="site"
				:live="live"
			/>
			<UBadge
				color="neutral"
				variant="subtle"
				icon="i-material-symbols-visibility-outline-rounded"
				label="View only"
				class="shrink-0"
			/>
		</template>
		<template #right>
			<DashboardRangePicker
				:range="range"
				@select="selectRange"
				@select-custom="selectCustomRange"
			/>
		</template>

		<slot />
	</AppPanel>
</template>
