<script setup lang="ts">
useHead({ title: "Danger zone" });

const { organization, can } = useOrganization();
const notify = useNotify();
const open = ref(false);
const confirmation = ref("");
const pending = ref(false);
const confirmed = computed(() => confirmation.value === organization.value.name);

watch(open, (isOpen) => {
	if (isOpen) {
		confirmation.value = "";
	}
});

async function deleteOrganization() {
	if (!confirmed.value) {
		return;
	}
	pending.value = true;
	const { error } = await authClient().organization.delete({ organizationId: organization.value.id });
	pending.value = false;
	if (error) {
		notify.error("Could not delete the Organization", null, error.message);
		return;
	}
	open.value = false;
	notify.success("Organization deleted", `${organization.value.name}, its Sites and their analytics data are gone.`);
	clearNuxtData();
	await navigateTo("/app", { replace: true });
}
</script>

<template>
	<UCard :ui="{ root: 'ring-error/40' }">
		<template #header>
			<h2 class="font-semibold text-error">
				Delete this Organization
			</h2>
			<p class="text-sm text-muted">
				Permanently deletes {{ organization.name }}, its Sites and all of their analytics data, and removes every Member. This cannot be undone.
			</p>
		</template>
		<UButton
			v-if="can({ organization: ['delete'] })"
			label="Delete Organization"
			color="error"
			icon="i-material-symbols-delete-outline-rounded"
			@click="open = true"
		/>
		<p
			v-else
			class="text-sm text-muted"
		>
			Only the Owner can delete this Organization.
		</p>

		<UModal
			v-model:open="open"
			:title="`Delete ${organization.name}?`"
			description="This permanently deletes the Organization, its Sites and all of their analytics data."
		>
			<template #body>
				<form
					id="delete-organization-form"
					class="grid gap-3"
					@submit.prevent="deleteOrganization"
				>
					<UFormField :label="`Type ${organization.name} to confirm`">
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
						form="delete-organization-form"
						label="Delete"
						color="error"
						:disabled="!confirmed"
						:loading="pending"
					/>
				</div>
			</template>
		</UModal>
	</UCard>
</template>
