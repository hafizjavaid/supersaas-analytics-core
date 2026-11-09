<script lang="ts">
export interface Confirmation {
	title: string;
	description: string;
	confirmLabel: string;
	run: () => Promise<boolean>;
}
</script>

<script setup lang="ts">
const confirmation = defineModel<Confirmation | null>({ default: null });
const pending = ref(false);
const open = computed({
	get: () => !!confirmation.value,
	set: (value) => {
		if (!value) {
			confirmation.value = null;
		}
	},
});

async function confirm() {
	if (!confirmation.value) {
		return;
	}
	pending.value = true;
	const done = await confirmation.value.run();
	pending.value = false;
	if (done) {
		confirmation.value = null;
	}
}
</script>

<template>
	<UModal
		v-model:open="open"
		:title="confirmation?.title"
		:description="confirmation?.description"
	>
		<template #footer="{ close }">
			<div class="flex w-full justify-end gap-2">
				<UButton
					label="Cancel"
					color="neutral"
					variant="outline"
					@click="close"
				/>
				<UButton
					:label="confirmation?.confirmLabel"
					color="error"
					:loading="pending"
					@click="confirm"
				/>
			</div>
		</template>
	</UModal>
</template>
