<script setup lang="ts">
import type { Funnel } from "#layers/core/shared/types/analytics";
import { journeyStartOfFunnel } from "#layers/core/shared/utils/journeys";

const props = defineProps<{ api: string; query: ReportQuery; funnel: Funnel; canManage?: boolean; journeysPath?: string }>();
defineEmits<{ edit: [funnel: Funnel] }>();

const journeysTo = computed(() => props.journeysPath && { path: props.journeysPath, query: journeyQuery(props.query, journeyStartOfFunnel(props.funnel.steps)) });
</script>

<template>
	<UCard :ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-4 sm:p-4', footer: 'flex justify-end px-4 py-2.5 sm:px-4' }">
		<template #header>
			<div class="flex items-center gap-2">
				<h3 class="min-w-0 flex-1 truncate font-medium text-highlighted">
					{{ funnel.name }}
				</h3>
				<UButton
					v-if="canManage"
					icon="i-material-symbols-edit-outline-rounded"
					color="neutral"
					variant="ghost"
					size="sm"
					:aria-label="`Edit ${funnel.name}`"
					@click="$emit('edit', funnel)"
				/>
			</div>
		</template>
		<DashboardFunnelReport
			:api="api"
			:query="query"
			:funnel="funnel"
		/>
		<template
			v-if="journeysTo"
			#footer
		>
			<ULink
				:to="journeysTo"
				class="text-xs text-muted hover:text-default"
			>
				Explore journeys →
			</ULink>
		</template>
	</UCard>
</template>
