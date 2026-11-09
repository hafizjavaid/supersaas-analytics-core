<script setup lang="ts">
import type { OutboundLinkBreakdownRow, OutboundLinkDetail } from "#layers/core/shared/types/analytics";
import { countryName } from "#layers/core/shared/utils/countries";

const props = defineProps<{ detail: OutboundLinkDetail | null | undefined; loading?: boolean }>();

const tiles = computed(() => {
	const detail = props.detail;
	return [
		{ label: "Clicks", value: formatCompactNumber(detail?.clicks ?? 0) },
		{ label: "Unique clicks", value: formatCompactNumber(detail?.uniqueClicks ?? 0), title: "Visitors who clicked, each counted once" },
		{ label: "Clicks per day", value: (detail?.clicksPerDay ?? 0).toFixed(1) },
		{ label: "Top country", value: detail?.topCountry ? countryName(detail.topCountry) : "–" },
	];
});

const breakdowns = computed(() => {
	const detail = props.detail;
	return [
		{ key: "countries", label: "Countries", rows: (detail?.countries ?? []).map(row => ({ ...row, label: countryName(row.value) })) },
		{ key: "pages", label: "Clicked from", rows: (detail?.pages ?? []).map(row => ({ ...row, label: row.value })) },
		{ key: "devices", label: "Devices", rows: (detail?.devices ?? []).map(row => ({ ...row, label: DEVICE_LABELS[row.value] ?? row.value })) },
	];
});

function share(row: OutboundLinkBreakdownRow) {
	const clicks = props.detail?.clicks ?? 0;
	return clicks > 0 ? `${Math.round((row.clicks / clicks) * 100)}%` : "0%";
}
</script>

<template>
	<div class="grid gap-5">
		<dl class="grid grid-cols-2 gap-1 sm:grid-cols-4">
			<div
				v-for="tile in tiles"
				:key="tile.label"
				class="rounded-md bg-elevated/50 px-3 py-2"
				:title="tile.title"
			>
				<dt class="text-sm text-muted">
					{{ tile.label }}
				</dt>
				<dd class="mt-1 truncate text-xl font-semibold tabular-nums text-highlighted">
					<USkeleton
						v-if="loading && !detail"
						class="h-7 w-16"
					/>
					<template v-else>
						{{ tile.value }}
					</template>
				</dd>
			</div>
		</dl>

		<DashboardSparkline
			v-if="detail && detail.trend.length > 1"
			:values="detail.trend"
			:width="640"
			:height="48"
			class="w-full"
			label="Clicks over the Range"
		/>

		<div class="grid gap-5 sm:grid-cols-3">
			<section
				v-for="breakdown in breakdowns"
				:key="breakdown.key"
				:aria-label="breakdown.label"
			>
				<h3 class="mb-2 text-sm font-medium text-highlighted">
					{{ breakdown.label }}
				</h3>
				<ul
					v-if="breakdown.rows.length"
					class="grid gap-1.5"
				>
					<li
						v-for="row in breakdown.rows"
						:key="row.value"
						class="flex items-center gap-2 text-sm"
					>
						<DashboardCountryFlag
							v-if="breakdown.key === 'countries'"
							:country="row.value"
						/>
						<DashboardDeviceIcon
							v-else-if="breakdown.key === 'devices'"
							dimension="device"
							:value="row.value"
						/>
						<span
							class="min-w-0 flex-1 truncate"
							:class="{ 'font-mono text-xs': breakdown.key === 'pages' }"
						>{{ row.label }}</span>
						<span class="tabular-nums text-highlighted">{{ formatCompactNumber(row.clicks) }}</span>
						<span class="w-9 text-right text-xs tabular-nums text-muted">{{ share(row) }}</span>
					</li>
				</ul>
				<p
					v-else
					class="text-sm text-muted"
				>
					No clicks yet
				</p>
			</section>
		</div>
	</div>
</template>
