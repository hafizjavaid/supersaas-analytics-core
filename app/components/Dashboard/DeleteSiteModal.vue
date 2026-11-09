<script setup lang="ts">
import type { Site } from "#layers/core/shared/types/analytics";

const props = defineProps<{ site: Site }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ deleted: [siteId: string] }>();

const notify = useNotify();
const confirmation = ref("");
const pending = ref(false);
const confirmed = computed(() => confirmation.value === props.site.name);

watch(open, (isOpen) => {
	if (isOpen) {
		confirmation.value = "";
	}
});

async function deleteSite() {
	if (!confirmed.value) {
		return;
	}
	pending.value = true;
	try {
		await $fetch(`/api/sites/${props.site.id}`, { method: "DELETE" });
		open.value = false;
		notify.success("Site deleted", `${props.site.name} and its analytics data are gone.`);
		emit("deleted", props.site.id);
	}
	catch (caught) {
		notify.error("Could not delete the site", caught);
	}
	finally {
		pending.value = false;
	}
}
</script>

<template>
	<UModal
		v-model:open="open"
		:title="`Delete ${site.name}?`"
		description="This permanently deletes the site and all of its analytics data."
	>
		<template #body>
			<form
				id="delete-site-form"
				class="grid gap-3"
				@submit.prevent="deleteSite"
			>
				<UFormField :label="`Type ${site.name} to confirm`">
					<UInput
						v-model="confirmation"
						autocomplete="off"
						class="w-full"
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
					type="submit"
					form="delete-site-form"
					label="Delete"
					color="error"
					:disabled="!confirmed"
					:loading="pending"
				/>
			</div>
		</template>
	</UModal>
</template>
