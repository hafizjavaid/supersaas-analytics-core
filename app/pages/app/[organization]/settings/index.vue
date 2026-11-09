<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import { createOrganizationSchema } from "#layers/core/shared/schemas/organizations";
import type { CreateOrganizationInput } from "#layers/core/shared/schemas/organizations";

useHead({ title: "Settings" });

const { organization, refresh, can } = useOrganization();
const notify = useNotify();
const editable = computed(() => can({ organization: ["update"] }));
const state = reactive<CreateOrganizationInput>({ name: organization.value.name, slug: organization.value.slug });
const pending = ref(false);

async function save(event: FormSubmitEvent<CreateOrganizationInput>) {
	pending.value = true;
	const { error } = await authClient().organization.update({ organizationId: organization.value.id, data: event.data });
	pending.value = false;
	if (error) {
		notify.error("Could not save the Organization", null, error.status === 400 ? error.message || "That URL is taken. Choose another one." : error.message);
		return;
	}
	notify.success("Organization saved");
	await refreshNuxtData("organizations");
	if (event.data.slug !== organization.value.slug) {
		await navigateTo(`/app/${event.data.slug}/settings`, { replace: true });
		return;
	}
	await refresh();
}
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				General
			</h2>
			<p class="text-sm text-muted">
				The Organization's name and the URL of its dashboard.
			</p>
		</template>
		<UForm
			:schema="createOrganizationSchema"
			:state="state"
			:disabled="!editable"
			class="flex flex-col gap-4"
			@submit="save"
		>
			<UFormField
				label="Name"
				name="name"
			>
				<UInput
					v-model="state.name"
					class="w-full"
				/>
			</UFormField>
			<UFormField
				label="URL"
				name="slug"
				:help="`Your dashboard lives at /app/${state.slug}.`"
			>
				<UInput
					v-model="state.slug"
					class="w-full"
				/>
			</UFormField>
			<div
				v-if="editable"
				class="flex justify-end"
			>
				<UButton
					type="submit"
					label="Save"
					:loading="pending"
				/>
			</div>
		</UForm>
	</UCard>
</template>
