<script setup lang="ts">
import type { OutboundLinkDetail } from "#layers/core/shared/types/analytics";

const props = defineProps<{ api: string; query: ReportQuery; url: string }>();
const open = defineModel<boolean>("open", { default: false });

const detailQuery = computed(() => ({ ...props.query, url: props.url }));
const { data, pending } = useSiteReport<OutboundLinkDetail>("outbound-links/detail", () => props.api, detailQuery);
const detail = computed(() => (data.value?.url === props.url ? data.value : null));
</script>

<template>
	<UModal
		v-model:open="open"
		:title="outboundLinkLabel(url)"
		description="Clicks on this Outbound link over the Range"
		:ui="{ content: 'sm:max-w-3xl' }"
	>
		<template #body>
			<DashboardOutboundLinkStats
				:detail="detail"
				:loading="pending"
			/>
		</template>
		<template #footer>
			<UButton
				:to="url"
				target="_blank"
				rel="noopener noreferrer"
				label="Open link"
				icon="i-material-symbols-open-in-new-rounded"
				color="neutral"
				variant="outline"
			/>
		</template>
	</UModal>
</template>
