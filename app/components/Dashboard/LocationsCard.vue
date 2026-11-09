<script setup lang="ts">
import type { LiveVisitors, LocationDimension, TopLocationRow } from "#layers/core/shared/types/analytics";
import type { Filter } from "#layers/core/shared/utils/filters";

const props = defineProps<{ api: string; query: ReportQuery; live: LiveVisitors | null }>();

type LocationTab = LocationDimension | "globe";

const TABS: DimensionTab<LocationTab>[] = [
	{ value: "country", label: "Countries" },
	{ value: "region", label: "Regions" },
	{ value: "city", label: "Cities" },
	{ value: "globe", icon: "i-material-symbols-language", ariaLabel: "Realtime visitor globe" },
];

const EMPTY_LABELS: Record<LocationDimension, string> = {
	country: "No country data yet",
	region: "No region data yet",
	city: "No city data yet",
};

function locationLabel(row: TopLocationRow, dimension: LocationDimension) {
	const country = countryName(row.country);
	if (dimension === "city") {
		return `${row.city}, ${country}`;
	}
	if (dimension === "region") {
		return `${row.region}, ${country}`;
	}
	return country;
}

function locationFilter(row: TopLocationRow, dimension: LocationDimension): Filter {
	if (dimension === "city") {
		return { dimension, value: `${row.country}-${row.city}` };
	}
	if (dimension === "region") {
		return { dimension, value: `${row.country}-${row.region}` };
	}
	return { dimension, value: row.country };
}

const { view, data, animate, changeView } = useRankedList<TopLocationRow, LocationDimension>("locations", props, "country");
const items = computed(() => (data.value?.rows ?? []).map(row => ({
	key: `${row.country}-${row.region}-${row.city}`,
	label: locationLabel(row, view.value),
	value: row.visits,
	country: row.country,
	filters: [locationFilter(row, view.value)],
})));

const showGlobe = ref(false);
const route = useRoute();
const simulateLocations = computed(() => import.meta.dev && route.query.simulateLocations === "true");

function onTabChange(tab: LocationTab, byPointer: boolean) {
	showGlobe.value = tab === "globe";
	if (tab !== "globe") {
		changeView(tab, byPointer);
	}
}
</script>

<template>
	<DashboardRankedCard
		title="Locations"
		:tabs="TABS"
		:view="showGlobe ? 'globe' : view"
		:ui="showGlobe ? { body: 'h-80 overflow-hidden p-0 sm:p-0' } : undefined"
		@change="onTabChange"
	>
		<DashboardLiveGlobe
			v-if="showGlobe"
			:count="live?.count ?? 0"
			:locations="live?.locations ?? []"
			:simulate="simulateLocations"
		/>
		<DashboardRankedList
			v-else
			:items="items"
			:total="data?.total"
			:animate="animate"
			:empty-label="EMPTY_LABELS[view]"
		>
			<template #icon="{ item }">
				<DashboardCountryFlag :country="item.country" />
			</template>
		</DashboardRankedList>
	</DashboardRankedCard>
</template>
