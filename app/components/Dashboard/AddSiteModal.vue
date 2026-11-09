<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import type { CreateSiteInput } from "#layers/core/shared/schemas/sites";
import { createSiteSchema } from "#layers/core/shared/schemas/sites";
import type { Site } from "#layers/core/shared/types/analytics";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ created: [site: Site] }>();

const { organization } = useOrganization();
const notify = useNotify();
const state = reactive({ name: "", domain: "", timezone: "UTC" });
const pending = ref(false);

async function submit(event: FormSubmitEvent<CreateSiteInput>) {
	pending.value = true;
	try {
		const site = await $fetch<Site>(`/api/organizations/${organization.value.id}/sites`, { method: "POST", body: event.data });
		Object.assign(state, { name: "", domain: "", timezone: "UTC" });
		open.value = false;
		notify.success("Site created", `${site.name} is ready to track.`);
		emit("created", site);
	}
	catch (caught) {
		notify.error("Could not create the site", caught);
	}
	finally {
		pending.value = false;
	}
}
</script>

<template>
	<UModal
		v-model:open="open"
		title="Add a site"
	>
		<template #body>
			<UForm
				id="add-site-form"
				:schema="createSiteSchema"
				:state="state"
				class="grid gap-4"
				@submit="submit"
			>
				<UFormField
					label="Name"
					name="name"
					required
				>
					<UInput
						v-model="state.name"
						placeholder="My blog"
						class="w-full"
					/>
				</UFormField>
				<UFormField
					label="Domain"
					name="domain"
					required
				>
					<UInput
						v-model="state.domain"
						placeholder="example.com"
						class="w-full"
					/>
				</UFormField>
				<UFormField
					label="Timezone"
					name="timezone"
					description="IANA timezone, e.g. America/New_York"
				>
					<UInput
						v-model="state.timezone"
						placeholder="UTC"
						class="w-full"
					/>
				</UFormField>
			</UForm>
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
					form="add-site-form"
					label="Create site"
					:loading="pending"
				/>
			</div>
		</template>
	</UModal>
</template>
