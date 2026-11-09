<script setup lang="ts">
import type { Confirmation } from "#layers/core/app/components/App/ConfirmModal.vue";
import type { SearchConnection, SearchProperty } from "#layers/core/shared/types/search";
import type { SearchEngine } from "#layers/core/shared/utils/search";

const props = defineProps<{ siteId: string; engine: SearchEngine; connection: SearchConnection | null }>();
const emit = defineEmits<{ changed: [] }>();

const notify = useNotify();
const name = SEARCH_ENGINE_NAMES[props.engine];
const path = computed(() => `/api/sites/${props.siteId}/search-connections/${props.engine}`);

const choosing = ref(false);
const properties = ref<SearchProperty[] | null>(null);
const loadingProperties = ref(false);
const property = ref<string>();
const saving = ref(false);
const confirmation = ref<Confirmation | null>(null);

const picking = computed(() => !!props.connection && (!props.connection.property || choosing.value));
const propertyItems = computed(() => (properties.value ?? []).map(entry => ({ label: entry.label, value: entry.id })));

const syncStatus = computed(() => {
	const shown = props.connection;
	if (!shown?.property) {
		return "";
	}
	if (!shown.syncedThrough) {
		return "Fetching the first days…";
	}
	const backfill = shown.backfilledFrom ? `, back to ${shown.backfilledFrom}` : "";
	const synced = shown.syncedAt ? ` · last sync ${new Date(shown.syncedAt * 1000).toLocaleString()}` : "";
	return `Data through ${shown.syncedThrough}${backfill}${synced}`;
});

async function loadProperties() {
	loadingProperties.value = true;
	try {
		properties.value = await $fetch<SearchProperty[]>(`${path.value}/properties`);
		property.value = props.connection?.property ?? properties.value[0]?.id;
	}
	catch (caught) {
		notify.error(`Could not list your ${name} properties`, caught);
	}
	finally {
		loadingProperties.value = false;
	}
}

watch(picking, (isPicking) => {
	if (isPicking && properties.value === null) {
		loadProperties();
	}
}, { immediate: true });

async function save() {
	saving.value = true;
	try {
		await $fetch(path.value, { method: "PATCH", body: { property: property.value } });
		notify.success(`${name} property saved`, "The Search page fills over the next few minutes.");
		choosing.value = false;
		emit("changed");
	}
	catch (caught) {
		notify.error("Could not save the property", caught);
	}
	finally {
		saving.value = false;
	}
}

function disconnect() {
	confirmation.value = {
		title: `Disconnect ${name}?`,
		description: `Its search data is removed from the Search page. Connecting again fetches the last 16 months anew.`,
		confirmLabel: "Disconnect",
		run: async () => {
			try {
				await $fetch(path.value, { method: "DELETE" });
			}
			catch (caught) {
				notify.error(`Could not disconnect ${name}`, caught);
				return false;
			}
			notify.success(`${name} disconnected`);
			properties.value = null;
			emit("changed");
			return true;
		},
	};
}
</script>

<template>
	<div class="flex flex-col gap-3">
		<slot
			v-if="!connection"
			name="connect"
		/>

		<template v-else>
			<div
				v-if="connection.property && !choosing"
				class="flex flex-wrap items-center gap-3"
			>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="truncate font-mono text-sm text-highlighted">{{ connection.property }}</span>
					<span class="text-xs text-muted">{{ syncStatus }}</span>
				</div>
				<UButton
					label="Change property"
					color="neutral"
					variant="outline"
					size="sm"
					@click="choosing = true"
				/>
				<UButton
					label="Disconnect"
					color="error"
					variant="ghost"
					size="sm"
					@click="disconnect"
				/>
			</div>

			<UAlert
				v-if="connection.lastError"
				color="warning"
				variant="subtle"
				icon="i-material-symbols-warning-outline-rounded"
				:title="connection.lastError"
			>
				<template
					v-if="$slots.reconnect"
					#actions
				>
					<slot name="reconnect" />
				</template>
			</UAlert>

			<form
				v-if="picking"
				class="flex flex-col gap-2 sm:flex-row sm:items-end"
				@submit.prevent="save"
			>
				<UFormField
					:label="`${name} property`"
					help="The website whose searches to show on this Site's Search page."
					class="flex-1"
				>
					<USelect
						v-model="property"
						:items="propertyItems"
						:loading="loadingProperties"
						:placeholder="loadingProperties ? 'Loading…' : 'No verified properties'"
						class="w-full font-mono"
					/>
				</UFormField>
				<div class="flex gap-2">
					<UButton
						v-if="connection.property"
						label="Cancel"
						color="neutral"
						variant="ghost"
						@click="choosing = false"
					/>
					<UButton
						v-else
						label="Disconnect"
						color="error"
						variant="ghost"
						@click="disconnect"
					/>
					<UButton
						type="submit"
						label="Save"
						:loading="saving"
						:disabled="!property"
					/>
				</div>
			</form>
		</template>

		<AppConfirmModal v-model="confirmation" />
	</div>
</template>
