<script setup lang="ts">
import type { SourceDimension, TopSourceRow } from "#layers/core/shared/types/analytics";
import type { Channel } from "#layers/core/shared/utils/channels";
import type { Filter, FilterDimension } from "#layers/core/shared/utils/filters";

const props = defineProps<{ api: string; query: ReportQuery }>();

const TABS: DimensionTab<SourceDimension>[] = [
	{ value: "channel", label: "Channel" },
	{ value: "referrer", label: "Referrer" },
	{ value: "ai", label: "AI" },
	{ value: "campaign", label: "Campaign" },
];

const UTM_TABS: DimensionTab<SourceDimension>[] = [
	{ value: "medium", label: "Medium" },
	{ value: "term", label: "Term" },
	{ value: "content", label: "Content" },
];

const EMPTY_LABELS: Record<SourceDimension, string> = {
	channel: "No visits yet",
	referrer: "No referrers yet",
	ai: "No visits from AI assistants yet",
	campaign: "No UTM campaigns yet",
	medium: "No UTM mediums yet",
	term: "No UTM terms yet",
	content: "No UTM content yet",
};

const FILTER_DIMENSIONS: Record<SourceDimension, FilterDimension> = {
	channel: "channel",
	referrer: "referrer",
	ai: "ai_assistant",
	campaign: "utm_campaign",
	medium: "utm_medium",
	term: "utm_term",
	content: "utm_content",
};

const CHANNEL_ICONS: Record<Channel, string> = {
	direct: "i-material-symbols-explore-outline",
	search: "i-material-symbols-search",
	social: "i-material-symbols-forum-outline",
	ai: "i-material-symbols-auto-awesome-outline",
	email: "i-material-symbols-mail-outline",
	paid: "i-material-symbols-ads-click",
	referral: "i-material-symbols-link",
};

const { view, data, animate, changeView } = useRankedList<TopSourceRow, SourceDimension>("sources", props, "channel");
const items = computed(() => (data.value?.rows ?? []).map(row => ({
	key: row.key,
	label: row.label,
	value: row.visits,
	referrerDomain: row.referrerDomain,
	channelIcon: view.value === "channel" && isChannel(row.key) ? CHANNEL_ICONS[row.key] : undefined,
	filters: [{ dimension: FILTER_DIMENSIONS[view.value], value: row.key }] as Filter[],
})));
</script>

<template>
	<DashboardRankedCard
		title="Sources"
		:tabs="TABS"
		:more-tabs="UTM_TABS"
		more-label="UTM"
		:view="view"
		@change="changeView"
	>
		<DashboardRankedList
			:items="items"
			:total="data?.total"
			:animate="animate"
			:empty-label="EMPTY_LABELS[view]"
		>
			<template #icon="{ item }">
				<UIcon
					v-if="item.channelIcon"
					:name="item.channelIcon"
					class="size-5 shrink-0 text-muted"
				/>
				<DashboardSourceIcon
					v-else-if="item.referrerDomain"
					:domain="item.referrerDomain"
				/>
			</template>
		</DashboardRankedList>
	</DashboardRankedCard>
</template>
