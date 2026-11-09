<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { RangeKey } from "#layers/core/shared/utils/dates";

const props = defineProps<{ range: DashboardRange }>();
const emit = defineEmits<{
	select: [key: Exclude<RangeKey, "custom">];
	selectCustom: [from: string, to: string];
}>();

const customOpen = ref(false);
const customFrom = ref("");
const customTo = ref("");

const items = computed<DropdownMenuItem[][]>(() => {
	const presets = RANGE_OPTIONS.filter(option => option.value !== "custom").map(option => ({
		label: option.label,
		type: "checkbox" as const,
		checked: option.value === props.range.key,
		onSelect: () => emit("select", option.value as Exclude<RangeKey, "custom">),
	}));
	return [
		presets.slice(0, 3),
		presets.slice(3),
		[{
			label: "Custom range",
			icon: "i-material-symbols-date-range-outline-rounded",
			type: "checkbox" as const,
			checked: props.range.key === "custom",
			onSelect: openCustom,
		}],
	];
});

function openCustom() {
	customFrom.value = props.range.from ?? "";
	customTo.value = props.range.to ?? "";
	customOpen.value = true;
}

const customValid = computed(() => !!customFrom.value && !!customTo.value);

function applyCustom() {
	if (!customValid.value) {
		return;
	}
	const [from, to] = [customFrom.value, customTo.value].sort() as [string, string];
	emit("selectCustom", from, to);
	customOpen.value = false;
}
</script>

<template>
	<UDropdownMenu
		:items="items"
		:content="{ align: 'end' }"
		:ui="{ content: 'min-w-44' }"
	>
		<UButton
			:label="rangeLabel(range)"
			color="neutral"
			variant="ghost"
			trailing-icon="i-material-symbols-keyboard-arrow-down-rounded"
			aria-label="Select date range"
		/>
	</UDropdownMenu>

	<UModal
		v-model:open="customOpen"
		title="Custom range"
		description="Days are in the Site's timezone. A range ends today at the latest."
	>
		<template #body>
			<form
				id="custom-range"
				class="grid grid-cols-1 gap-4 sm:grid-cols-2"
				@submit.prevent="applyCustom"
			>
				<UFormField label="From">
					<UInput
						v-model="customFrom"
						type="date"
						class="w-full"
						required
					/>
				</UFormField>
				<UFormField label="To">
					<UInput
						v-model="customTo"
						type="date"
						class="w-full"
						required
					/>
				</UFormField>
			</form>
		</template>
		<template #footer="{ close }">
			<div class="flex w-full justify-end gap-2">
				<UButton
					label="Cancel"
					color="neutral"
					variant="outline"
					@click="close"
				/>
				<UButton
					label="Apply"
					type="submit"
					form="custom-range"
					:disabled="!customValid"
				/>
			</div>
		</template>
	</UModal>
</template>
