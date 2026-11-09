<script setup lang="ts">
import type { Funnel, FunnelResults } from "#layers/core/shared/types/analytics";
import type { FunnelDefinition, FunnelStep } from "#layers/core/shared/utils/funnels";
import { FUNNEL_WINDOW_LABELS, FUNNEL_WINDOWS, MAX_FUNNEL_STEPS, MIN_FUNNEL_STEPS } from "#layers/core/shared/utils/funnels";

const props = defineProps<{ siteId: string; query: ReportQuery; funnel?: Funnel | null }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ saved: [funnel: Funnel]; deleted: [funnel: Funnel] }>();

const notify = useNotify();

const windowItems = FUNNEL_WINDOWS.map(window => ({ label: `within ${FUNNEL_WINDOW_LABELS[window]}`, value: window }));
const kindItems = [
	{ label: "Pageview", value: "page" },
	{ label: "Event", value: "event" },
];

function blankDraft(): FunnelDefinition {
	return { name: "", window: "24h", steps: [{ kind: "page", value: "/", label: "" }, { kind: "page", value: "", label: "" }] };
}

function draftOf(funnel: Funnel): FunnelDefinition {
	return { name: funnel.name, window: funnel.window, steps: funnel.steps.map(step => ({ ...step })) };
}

const draft = ref<FunnelDefinition>(blankDraft());
const saving = ref(false);
const confirmingDelete = ref(false);

watch([open, () => props.funnel], () => {
	if (open.value) {
		draft.value = props.funnel ? draftOf(props.funnel) : blankDraft();
		confirmingDelete.value = false;
	}
}, { immediate: true });

function addStep() {
	draft.value.steps.push({ kind: "page", value: "", label: "" });
}

function removeStep(index: number) {
	draft.value.steps.splice(index, 1);
}

function moveStep(index: number, offset: -1 | 1) {
	const steps = draft.value.steps;
	[steps[index], steps[index + offset]] = [steps[index + offset]!, steps[index]!];
}

function placeholderOf(step: FunnelStep) {
	return step.kind === "page" ? "/signup/*" : "Signup";
}

const preview = ref<FunnelResults | null>(null);
const previewing = ref(false);
const previewDraft = computed(() => previewableDraft(draft.value));

watchDebounced([previewDraft, () => props.query, open], async () => {
	if (!open.value || !previewDraft.value) {
		preview.value = null;
		return;
	}
	previewing.value = true;
	try {
		preview.value = await $fetch<FunnelResults>(`/api/sites/${props.siteId}/funnel-preview`, { method: "POST", query: props.query, body: previewDraft.value });
	}
	catch {
		preview.value = null;
	}
	finally {
		previewing.value = false;
	}
}, { debounce: 300, deep: true, immediate: true });

async function save() {
	saving.value = true;
	try {
		const saved = props.funnel
			? await $fetch<Funnel>(`/api/sites/${props.siteId}/funnels/${props.funnel.id}`, { method: "PATCH", body: draft.value })
			: await $fetch<Funnel>(`/api/sites/${props.siteId}/funnels`, { method: "POST", body: draft.value });
		notify.success(props.funnel ? `Saved ${saved.name}` : `Created ${saved.name}`);
		emit("saved", saved);
		open.value = false;
	}
	catch (caught) {
		notify.error("Could not save the funnel", caught);
	}
	finally {
		saving.value = false;
	}
}

async function remove() {
	if (!props.funnel) {
		return;
	}
	if (!confirmingDelete.value) {
		confirmingDelete.value = true;
		return;
	}
	saving.value = true;
	try {
		await $fetch(`/api/sites/${props.siteId}/funnels/${props.funnel.id}`, { method: "DELETE" });
		notify.success(`Deleted ${props.funnel.name}`);
		emit("deleted", props.funnel);
		open.value = false;
	}
	catch (caught) {
		notify.error("Could not delete the funnel", caught);
	}
	finally {
		saving.value = false;
	}
}
</script>

<template>
	<USlideover
		v-model:open="open"
		:title="funnel ? `Edit ${funnel.name}` : 'New funnel'"
		description="Visitors count when they complete the steps in order within the window. Other pages and events in between are fine."
		:ui="{ content: 'max-w-xl' }"
	>
		<template #body>
			<form
				id="funnel-builder"
				class="flex flex-col gap-5"
				@submit.prevent="save"
			>
				<div class="flex flex-col gap-3 sm:flex-row">
					<UFormField
						label="Name"
						class="flex-1"
					>
						<UInput
							v-model="draft.name"
							placeholder="Pricing to signup"
							class="w-full"
							autocomplete="off"
						/>
					</UFormField>
					<UFormField label="Window">
						<USelect
							v-model="draft.window"
							:items="windowItems"
							class="w-full sm:w-40"
						/>
					</UFormField>
				</div>

				<fieldset class="flex flex-col gap-3">
					<legend class="mb-2 text-sm font-medium text-highlighted">
						Steps
					</legend>
					<div
						v-for="(step, index) in draft.steps"
						:key="index"
						class="flex flex-col gap-2 rounded-md border border-default p-3"
					>
						<div class="flex items-center gap-2">
							<span class="flex size-6 shrink-0 items-center justify-center rounded-full bg-elevated text-xs font-medium tabular-nums">{{ index + 1 }}</span>
							<USelect
								v-model="step.kind"
								:items="kindItems"
								:aria-label="`Step ${index + 1} type`"
								class="w-32"
							/>
							<div class="ml-auto flex items-center">
								<UButton
									icon="i-material-symbols-arrow-upward-rounded"
									color="neutral"
									variant="ghost"
									size="xs"
									:aria-label="`Move step ${index + 1} up`"
									:disabled="index === 0"
									@click="moveStep(index, -1)"
								/>
								<UButton
									icon="i-material-symbols-arrow-downward-rounded"
									color="neutral"
									variant="ghost"
									size="xs"
									:aria-label="`Move step ${index + 1} down`"
									:disabled="index === draft.steps.length - 1"
									@click="moveStep(index, 1)"
								/>
								<UButton
									icon="i-material-symbols-close-rounded"
									color="neutral"
									variant="ghost"
									size="xs"
									:aria-label="`Remove step ${index + 1}`"
									:disabled="draft.steps.length <= MIN_FUNNEL_STEPS"
									@click="removeStep(index)"
								/>
							</div>
						</div>
						<div class="flex flex-col gap-2 sm:flex-row">
							<UInput
								v-model="step.value"
								:placeholder="placeholderOf(step)"
								:aria-label="step.kind === 'page' ? `Step ${index + 1} page pattern` : `Step ${index + 1} Event name`"
								class="flex-1 font-mono"
								autocomplete="off"
							/>
							<UInput
								v-model="step.label"
								placeholder="Label (optional)"
								:aria-label="`Step ${index + 1} label`"
								class="sm:w-44"
								autocomplete="off"
							/>
						</div>
					</div>
					<UButton
						v-if="draft.steps.length < MAX_FUNNEL_STEPS"
						label="Add step"
						icon="i-material-symbols-add-rounded"
						color="neutral"
						variant="outline"
						size="sm"
						class="self-start"
						@click="addStep"
					/>
					<p class="text-xs text-muted">
						A page pattern starts with /, and * matches any characters.
					</p>
				</fieldset>

				<section
					aria-labelledby="funnel-preview"
					class="flex flex-col gap-3"
				>
					<div class="flex items-center gap-2">
						<h3
							id="funnel-preview"
							class="text-sm font-medium text-highlighted"
						>
							Preview over the current range
						</h3>
						<UIcon
							v-if="previewing"
							name="i-material-symbols-progress-activity"
							class="size-4 animate-spin text-dimmed"
						/>
					</div>
					<DashboardFunnelResults
						v-if="preview"
						:report="preview"
					/>
					<p
						v-else
						class="text-sm text-muted"
					>
						Complete at least two steps to see a preview.
					</p>
				</section>
			</form>
		</template>

		<template #footer>
			<div class="flex w-full items-center gap-2">
				<UButton
					v-if="funnel"
					:label="confirmingDelete ? 'Confirm delete' : 'Delete'"
					icon="i-material-symbols-delete-outline-rounded"
					color="error"
					:variant="confirmingDelete ? 'solid' : 'ghost'"
					:disabled="saving"
					@click="remove"
				/>
				<UButton
					label="Cancel"
					color="neutral"
					variant="ghost"
					class="ml-auto"
					@click="open = false"
				/>
				<UButton
					type="submit"
					form="funnel-builder"
					:label="funnel ? 'Save funnel' : 'Create funnel'"
					:loading="saving"
					:disabled="!draft.name.trim() || !previewDraft"
				/>
			</div>
		</template>
	</USlideover>
</template>
