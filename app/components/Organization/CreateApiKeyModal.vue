<script setup lang="ts">
import type { CreatedApiKey } from "#layers/core/shared/types/api-keys";

const props = defineProps<{ organizationId: string }>();
const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ created: [] }>();

const notify = useNotify();
const { copy, copied } = useClipboard({ copiedDuring: 2000 });
const name = ref("");
const pending = ref(false);
const created = ref<CreatedApiKey | null>(null);

watch(open, (isOpen) => {
	if (isOpen) {
		name.value = "";
		created.value = null;
	}
});

async function create() {
	pending.value = true;
	try {
		created.value = await $fetch<CreatedApiKey>(`/api/organizations/${props.organizationId}/api-keys`, {
			method: "POST",
			body: { name: name.value },
		});
		emit("created");
	}
	catch (caught) {
		notify.error("Could not create the API key", caught);
	}
	finally {
		pending.value = false;
	}
}
</script>

<template>
	<UModal
		v-model:open="open"
		:title="created ? `${created.name} is ready` : 'New API key'"
		:description="created
			? 'Copy the key now. It is shown only this once; if you lose it, revoke it and create another.'
			: 'A key reads every Site of this Organization, read-only. Name it after where you will use it.'"
		:dismissible="!created"
	>
		<template #body>
			<div
				v-if="created"
				class="flex items-center gap-2"
			>
				<UInput
					:model-value="created.key"
					readonly
					class="flex-1 font-mono"
					aria-label="API key"
					@focus="(event: FocusEvent) => (event.target as HTMLInputElement).select()"
				/>
				<UButton
					:icon="copied ? 'i-material-symbols-check-rounded' : 'i-material-symbols-content-copy-outline-rounded'"
					:label="copied ? 'Copied' : 'Copy'"
					color="neutral"
					variant="outline"
					@click="copy(created.key)"
				/>
			</div>
			<form
				v-else
				id="create-api-key-form"
				@submit.prevent="create"
			>
				<UFormField
					label="Name"
					help="Optional, for example the agent or script that uses it."
				>
					<UInput
						v-model="name"
						placeholder="Claude Code"
						class="w-full"
						autocomplete="off"
						maxlength="100"
						autofocus
					/>
				</UFormField>
			</form>
		</template>
		<template #footer="{ close }">
			<div class="flex w-full justify-end gap-2">
				<UButton
					v-if="created"
					label="Done"
					@click="close"
				/>
				<template v-else>
					<UButton
						label="Cancel"
						color="neutral"
						variant="outline"
						@click="close"
					/>
					<UButton
						type="submit"
						form="create-api-key-form"
						label="Create key"
						:loading="pending"
					/>
				</template>
			</div>
		</template>
	</UModal>
</template>
