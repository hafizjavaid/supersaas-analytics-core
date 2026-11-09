<script setup lang="ts">
import type { Goal } from "#layers/core/shared/types/analytics";
import type { GoalDefinition } from "#layers/core/shared/utils/goals";

const props = defineProps<{ siteId: string; editable: boolean }>();

const notify = useNotify();
const { data: goals, refresh } = await useFetch<Goal[]>(() => `/api/sites/${props.siteId}/goals`, { key: `goals:${props.siteId}`, default: () => [] });

const customKinds = [
	{ label: "Event name", value: "event" },
	{ label: "Page pattern", value: "page" },
] as const;
const kind = ref<"event" | "page">("event");
const value = ref("");
const name = ref("");
const valueError = ref<string>();
const pending = ref(false);

watch([kind, value], () => {
	valueError.value = undefined;
});

const has = (definition: GoalDefinition) => goals.value.some(goal => sameGoal(goal, definition));

async function add(definition: GoalDefinition, goalName?: string) {
	pending.value = true;
	try {
		const goal = await $fetch<Goal>(`/api/sites/${props.siteId}/goals`, { method: "POST", body: { ...definition, name: goalName } });
		notify.success(`Added ${goal.name}`);
		await refresh();
		return true;
	}
	catch (caught) {
		notify.error("Could not add the goal", caught);
		return false;
	}
	finally {
		pending.value = false;
	}
}

async function addCustom() {
	const normalized = normalizeGoalValue(kind.value, value.value);
	if (!normalized) {
		valueError.value = kind.value === "page" ? "Start the page pattern with /" : "Enter an Event name";
		return;
	}
	if (has({ kind: kind.value, value: normalized })) {
		valueError.value = "This goal already exists";
		return;
	}
	if (await add({ kind: kind.value, value: normalized }, name.value.trim() || undefined)) {
		value.value = "";
		name.value = "";
	}
}

async function remove(goal: Goal) {
	pending.value = true;
	try {
		await $fetch(`/api/sites/${props.siteId}/goals/${goal.id}`, { method: "DELETE" });
		notify.success(`Removed ${goal.name}`);
		await refresh();
	}
	catch (caught) {
		notify.error("Could not remove the goal", caught);
	}
	finally {
		pending.value = false;
	}
}
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Goals
			</h2>
			<p class="text-sm text-muted">
				Mark the Events and pages that matter. The dashboard then reports how many Visitors convert, and selecting a goal shows where they came from.
			</p>
		</template>
		<div class="flex flex-col gap-6">
			<section
				v-if="editable"
				aria-labelledby="quick-add-goals"
				class="flex flex-col gap-2"
			>
				<h3
					id="quick-add-goals"
					class="text-sm font-medium text-highlighted"
				>
					Quick add, no code
				</h3>
				<p class="text-sm text-muted">
					The tracking snippet already captures these clicks.
				</p>
				<div class="flex flex-wrap gap-2">
					<UButton
						v-for="quick in QUICK_GOALS"
						:key="quick.name"
						:label="quick.name"
						:icon="has(quick) ? 'i-material-symbols-check-rounded' : quick.icon"
						:disabled="pending || has(quick)"
						color="neutral"
						variant="outline"
						size="sm"
						class="rounded-full"
						@click="add(quick, quick.name)"
					/>
				</div>
			</section>

			<form
				v-if="editable"
				aria-labelledby="custom-goal"
				class="flex flex-col gap-3"
				@submit.prevent="addCustom"
			>
				<h3
					id="custom-goal"
					class="text-sm font-medium text-highlighted"
				>
					Custom goal
				</h3>
				<URadioGroup
					v-model="kind"
					:items="[...customKinds]"
					orientation="horizontal"
					legend="Counts"
				/>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
					<UFormField
						:label="kind === 'event' ? 'Event name' : 'Page pattern'"
						:help="kind === 'event' ? 'As sent by sd(\'Name\') or data-sd-event=&quot;Name&quot;.' : '* matches any characters: /blog/* covers every post.'"
						:error="valueError"
						class="flex-1"
					>
						<UInput
							v-model="value"
							:placeholder="kind === 'event' ? 'Signup' : '/thank-you'"
							class="w-full font-mono"
							autocomplete="off"
						/>
					</UFormField>
					<UFormField
						label="Name (optional)"
						class="flex-1"
					>
						<UInput
							v-model="name"
							placeholder="Signups"
							class="w-full"
							autocomplete="off"
						/>
					</UFormField>
					<UButton
						type="submit"
						label="Add goal"
						class="sm:mt-6"
						:loading="pending"
						:disabled="!value.trim()"
					/>
				</div>
			</form>

			<ul
				v-if="goals.length"
				class="divide-y divide-default rounded-md border border-default"
				aria-label="Goals"
			>
				<li
					v-for="goal in goals"
					:key="goal.id"
					class="flex items-center justify-between gap-2 px-3 py-2"
				>
					<div class="flex min-w-0 flex-col">
						<span class="truncate text-sm text-highlighted">{{ goal.name }}</span>
						<span class="truncate font-mono text-xs text-muted">{{ goal.kind === "event" ? `Event ${goal.value}` : describeGoal(goal) }}</span>
					</div>
					<UButton
						v-if="editable"
						icon="i-material-symbols-close-rounded"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="`Remove ${goal.name}`"
						:disabled="pending"
						@click="remove(goal)"
					/>
				</li>
			</ul>
			<p
				v-else
				class="text-sm text-muted"
			>
				No goals yet.
			</p>
		</div>
	</UCard>
</template>
