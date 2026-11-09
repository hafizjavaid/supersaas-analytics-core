<script setup lang="ts">
import type { LiveVisitors, SharedSite } from "#layers/core/shared/types/analytics";

const props = defineProps<{ site: SharedSite; live?: LiveVisitors | null }>();

const timezoneLabel = computed(() => `Times in ${formatTimezoneOffset(props.site.timezone)} · ${props.site.timezone}`);
</script>

<template>
	<div class="flex min-w-0 items-center gap-2">
		<DashboardSourceIcon :domain="site.domain" />
		<span class="truncate font-semibold text-highlighted">{{ site.name }}</span>
		<span class="hidden truncate font-mono text-sm font-normal text-muted md:inline">{{ site.domain }}</span>
		<UBadge
			v-if="live && live.count > 0"
			color="success"
			variant="subtle"
			class="shrink-0 gap-1.5"
		>
			<span class="size-1.5 rounded-full bg-success" />
			{{ live.count }} online
		</UBadge>
		<UBadge
			color="neutral"
			variant="outline"
			icon="i-material-symbols-schedule-outline-rounded"
			:label="timezoneLabel"
			class="hidden shrink-0 font-normal lg:inline-flex"
		/>
	</div>
</template>
