<script setup lang="ts">
import type { Site } from "#layers/core/shared/types/analytics";

const props = defineProps<{ site: Site }>();

const trackerOrigin = useTrackerOrigin();
const snippet = computed(() => trackingSnippet(trackerOrigin.value, props.site.id));
const { copy, copied } = useClipboard({ copiedDuring: 2000 });
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Tracking code
			</h2>
			<p class="text-sm text-muted">
				Add this script to every page of {{ site.domain }}, ideally before the closing body tag.
			</p>
		</template>
		<div class="flex items-start gap-2 bg-elevated p-3">
			<code class="min-w-0 flex-1 font-mono text-sm break-all">{{ snippet }}</code>
			<UTooltip :text="copied ? 'Script copied' : 'Copy script'">
				<UButton
					:icon="copied ? 'i-material-symbols-check-rounded' : 'i-material-symbols-content-copy-outline-rounded'"
					color="neutral"
					variant="ghost"
					size="sm"
					aria-label="Copy script"
					@click="copy(snippet)"
				/>
			</UTooltip>
		</div>
	</UCard>
</template>
