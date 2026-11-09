<script setup lang="ts">
import type { DatabaseSize } from "#layers/core/shared/types/admin";

definePageMeta({ middleware: ["admin"], layout: "dashboard" });
useHead({ title: "Database · Admin" });

const { data: database } = await useFetch<DatabaseSize>("/api/admin/database");
</script>

<template>
	<AppPanel
		id="admin-database"
		title="Database"
	>
		<div class="mx-auto flex w-full max-w-3xl flex-col gap-4">
			<UAlert
				v-if="database?.alert"
				color="error"
				variant="subtle"
				icon="i-material-symbols-warning-outline-rounded"
				:title="`The database is past ${formatBytes(database.alertBytes)}`"
				description="D1 stops writes at its limit."
			/>

			<UCard v-if="database">
				<template #header>
					<h2 class="font-semibold text-highlighted">
						D1 database size
					</h2>
					<p class="text-sm text-muted">
						All Organizations share one database. The alert is at {{ formatBytes(database.alertBytes) }} of
						{{ formatBytes(database.limitBytes) }}.
					</p>
				</template>
				<div class="flex flex-col gap-3">
					<div class="flex flex-wrap items-baseline justify-between gap-2">
						<p class="text-sm text-muted">
							<span class="text-lg font-semibold tabular-nums text-highlighted">{{ formatBytes(database.sizeBytes) }}</span>
							of {{ formatBytes(database.limitBytes) }}
						</p>
						<p class="text-sm font-medium tabular-nums text-highlighted">
							{{ formatPercent(database.sizeBytes / database.limitBytes) }}
						</p>
					</div>
					<UProgress
						:model-value="Math.min(database.sizeBytes, database.limitBytes)"
						:max="database.limitBytes"
						:color="database.alert ? 'error' : 'primary'"
						aria-label="Database size"
					/>
				</div>
			</UCard>
		</div>
	</AppPanel>
</template>
