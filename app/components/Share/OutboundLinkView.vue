<script setup lang="ts">
import type { OutboundLinkDetail, SharedSite } from "#layers/core/shared/types/analytics";

const props = defineProps<{ site: SharedSite; api: string; url: string }>();

const { range, reportQuery, selectRange, selectCustomRange } = useDashboardQuery();
const { data, pending } = useSiteReport<OutboundLinkDetail>("outbound-link", () => props.api, reportQuery);

useHead({ title: () => outboundLinkLabel(props.url) });
</script>

<template>
	<UDashboardGroup unit="rem">
		<AppPanel id="share-outbound-link">
			<template #title>
				<div class="flex min-w-0 items-center gap-2">
					<DashboardSourceIcon :domain="outboundLinkHost(url)" />
					<span class="truncate font-semibold text-highlighted">{{ outboundLinkLabel(url) }}</span>
					<span class="hidden truncate text-sm font-normal text-muted md:inline">from {{ site.domain }}</span>
				</div>
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

			<UCard class="mx-auto w-full max-w-4xl">
				<DashboardOutboundLinkStats
					:detail="data"
					:loading="pending"
				/>
			</UCard>
		</AppPanel>
	</UDashboardGroup>
</template>
