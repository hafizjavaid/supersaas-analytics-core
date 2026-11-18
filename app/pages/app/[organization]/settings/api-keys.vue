<script setup lang="ts">
import type { Confirmation } from "#layers/core/app/components/App/ConfirmModal.vue";
import type { ApiKey } from "#layers/core/shared/types/api-keys";

useHead({ title: "API keys" });

const { organization, can } = useOrganization();
const notify = useNotify();
const { attempt } = useDemo();
const manages = computed(() => can({ apiKey: ["create"] }));
const { data: keys, refresh } = await useFetch<ApiKey[]>(`/api/organizations/${organization.value.id}/api-keys`, {
	key: `api-keys:${organization.value.id}`,
	default: () => [],
	immediate: manages.value,
});

const createOpen = ref(false);
const confirmation = ref<Confirmation | null>(null);

function formatDay(seconds: number) {
	return new Date(seconds * 1000).toLocaleDateString(undefined, { dateStyle: "medium" });
}

function formatMoment(seconds: number) {
	return new Date(seconds * 1000).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" });
}

function revoke(key: ApiKey) {
	confirmation.value = {
		title: `Revoke ${key.name}?`,
		description: "Anything using this key loses access on its next request. This cannot be undone.",
		confirmLabel: "Revoke",
		run: async () => {
			try {
				await $fetch(`/api/organizations/${organization.value.id}/api-keys/${key.id}`, { method: "DELETE" });
			}
			catch (caught) {
				notify.error("Could not revoke the API key", caught);
				return false;
			}
			notify.success(`Revoked ${key.name}`);
			await refresh();
			return true;
		},
	};
}
</script>

<template>
	<UCard :ui="{ body: 'p-0 sm:p-0' }">
		<template #header>
			<div class="flex flex-wrap items-start justify-between gap-3">
				<div class="min-w-0 flex-1">
					<h2 class="font-semibold text-highlighted">
						API keys
					</h2>
					<p class="text-sm text-muted">
						Let scripts, the CLI and AI agents over MCP read this Organization's reports without the dashboard.
						Keys only read, and keep working after the Member who created them leaves.
					</p>
				</div>
				<UButton
					v-if="manages"
					label="Create key"
					icon="i-material-symbols-add-rounded"
					@click="attempt(() => createOpen = true)"
				/>
			</div>
		</template>

		<p
			v-if="!manages"
			class="px-4 py-6 text-sm text-muted sm:px-6"
		>
			Only Owners and Admins can see and create API keys.
		</p>
		<ul
			v-else-if="keys.length"
			class="divide-y divide-default"
			aria-label="API keys"
		>
			<li
				v-for="key in keys"
				:key="key.id"
				class="flex items-center gap-3 px-4 py-3 sm:px-6"
			>
				<div class="min-w-0 flex-1">
					<p class="flex items-center gap-2 truncate font-medium text-highlighted">
						<span class="truncate">{{ key.name }}</span>
						<code class="shrink-0 rounded bg-elevated px-1.5 py-0.5 font-mono text-xs text-muted">{{ key.prefix }}…</code>
					</p>
					<p class="truncate text-sm text-muted">
						Created {{ formatDay(key.createdAt) }}{{ key.createdByName ? ` by ${key.createdByName}` : "" }} ·
						{{ key.lastUsedAt ? `last used ${formatMoment(key.lastUsedAt)}` : "never used" }}
					</p>
				</div>
				<UButton
					v-if="can({ apiKey: ['delete'] })"
					label="Revoke"
					color="error"
					variant="ghost"
					size="sm"
					@click="attempt(() => revoke(key))"
				/>
			</li>
		</ul>
		<UEmpty
			v-else
			icon="i-material-symbols-key-outline-rounded"
			title="No API keys yet"
			description="Create one to read your reports from a script, the CLI or an AI agent."
			class="py-8"
		/>

		<OrganizationCreateApiKeyModal
			v-model:open="createOpen"
			:organization-id="organization.id"
			@created="refresh"
		/>
		<AppConfirmModal v-model="confirmation" />
	</UCard>
</template>
