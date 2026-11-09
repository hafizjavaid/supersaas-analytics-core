<script setup lang="ts">
import type { Site } from "#layers/core/shared/types/analytics";

type ExclusionField = "excludedIps" | "excludedPaths";

const props = defineProps<{
	site: Site;
	field: ExclusionField;
	title: string;
	description: string;
	label: string;
	placeholder: string;
	help: string;
	invalidMessage: string;
	normalize: (rule: string) => string | null;
	editable: boolean;
	offerCurrentIp?: boolean;
}>();
const emit = defineEmits<{ saved: [] }>();

const notify = useNotify();
const draft = ref("");
const draftError = ref<string>();
const pending = ref(false);
const rules = computed(() => props.site[props.field]);

watch(draft, () => {
	draftError.value = undefined;
});

async function save(next: string[], successTitle: string) {
	pending.value = true;
	try {
		await $fetch(`/api/sites/${props.site.id}`, { method: "PATCH", body: { [props.field]: next } });
		notify.success(successTitle);
		emit("saved");
		return true;
	}
	catch (caught) {
		notify.error(`Could not save ${props.title.toLowerCase()}`, caught);
		return false;
	}
	finally {
		pending.value = false;
	}
}

async function add(value: string) {
	const rule = props.normalize(value);
	if (!rule) {
		draftError.value = props.invalidMessage;
		return;
	}
	if (rules.value.includes(rule)) {
		draftError.value = "Already in the list";
		return;
	}
	if (await save([...rules.value, rule], `Added ${rule}`)) {
		draft.value = "";
	}
}

function remove(rule: string) {
	return save(rules.value.filter(existing => existing !== rule), `Removed ${rule}`);
}

async function addCurrentIp() {
	try {
		const { ip } = await $fetch<{ ip: string }>("/api/client-ip");
		await add(ip);
	}
	catch (caught) {
		notify.error("Could not read your IP address", caught);
	}
}
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				{{ title }}
			</h2>
			<p class="text-sm text-muted">
				{{ description }}
			</p>
		</template>
		<div class="flex flex-col gap-4">
			<form
				v-if="editable"
				class="flex flex-col gap-3 sm:flex-row sm:items-start"
				@submit.prevent="add(draft)"
			>
				<UFormField
					:label="label"
					:help="help"
					:error="draftError"
					class="flex-1"
				>
					<UInput
						v-model="draft"
						:placeholder="placeholder"
						class="w-full font-mono"
						autocomplete="off"
					/>
				</UFormField>
				<div class="flex gap-2 sm:mt-6">
					<UButton
						type="submit"
						label="Add"
						:loading="pending"
						:disabled="!draft.trim()"
					/>
					<UButton
						v-if="offerCurrentIp"
						label="Add my current IP"
						color="neutral"
						variant="outline"
						icon="i-material-symbols-my-location-outline-rounded"
						:disabled="pending"
						@click="addCurrentIp"
					/>
				</div>
			</form>
			<ul
				v-if="rules.length"
				class="divide-y divide-default rounded-md border border-default"
			>
				<li
					v-for="rule in rules"
					:key="rule"
					class="flex items-center justify-between gap-2 px-3 py-2"
				>
					<span class="truncate font-mono text-sm">{{ rule }}</span>
					<UButton
						v-if="editable"
						icon="i-material-symbols-close-rounded"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="`Remove ${rule}`"
						:disabled="pending"
						@click="remove(rule)"
					/>
				</li>
			</ul>
			<p
				v-else
				class="text-sm text-muted"
			>
				Nothing excluded yet.
			</p>
		</div>
	</UCard>
</template>
