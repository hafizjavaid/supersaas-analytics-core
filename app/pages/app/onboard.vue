<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import { createOrganizationSchema } from "#layers/core/shared/schemas/organizations";
import type { CreateOrganizationInput } from "#layers/core/shared/schemas/organizations";
import type { Site } from "#layers/core/shared/types/analytics";
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";

definePageMeta({ middleware: ["auth"] });
useHead({ title: "Create your Organization" });

const route = useRoute();
const notify = useNotify();
const domain = parseSiteDomain(route.query.domain);
const state = reactive<CreateOrganizationInput>(domain ? organizationFromDomain(domain) : { name: "", slug: "" });
const slugEdited = ref(false);
const loading = ref(false);

const { data: organizations } = domain
	? await useFetch<OrganizationMembership[]>("/api/organizations")
	: { data: ref<OrganizationMembership[]>([]) };
const addingToExisting = !!organizations.value?.length;

watch(() => state.name, (name) => {
	if (!slugEdited.value) {
		state.slug = slugify(name);
	}
});

onMounted(async () => {
	if (domain && addingToExisting) {
		const { data } = await authClient().getSession();
		await addSite(domain, organizationForNewSite(organizations.value!, data?.session.activeOrganizationId)!);
	}
});

// The Organization already exists when this fails, so the user lands on it with the reason rather than back here.
async function addSite(siteDomain: string, organization: { id: string; slug: string }) {
	const base = `/app/${organization.slug}`;
	try {
		const sites = await $fetch<Site[]>(`/api/organizations/${organization.id}/sites`);
		const existing = siteWithDomain(sites, siteDomain);
		if (existing) {
			return await navigateTo(`${base}/sites/${existing.id}`, { replace: true });
		}
		const site = await $fetch<Site>(`/api/organizations/${organization.id}/sites`, {
			method: "POST",
			body: { name: siteDomain, domain: siteDomain, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
		});
		return await navigateTo(`${base}/sites/${site.id}/settings`, { replace: true });
	}
	catch (caught) {
		notify.error(`Could not add ${siteDomain}`, caught);
		return navigateTo(base, { replace: true });
	}
}

async function onSubmit(event: FormSubmitEvent<CreateOrganizationInput>) {
	loading.value = true;
	const { data, error } = await authClient().organization.create(event.data);
	if (error || !data) {
		loading.value = false;
		notify.error("Could not create the Organization", null, error?.status === 400 ? "That URL is taken. Choose another one." : error?.message);
		return;
	}
	await authClient().organization.setActive({ organizationId: data.id });
	if (domain) {
		await addSite(domain, data);
		return;
	}
	await navigateTo(`/app/${data.slug}`);
}
</script>

<template>
	<AuthCard v-if="addingToExisting">
		<div class="flex items-center gap-3 text-sm text-muted">
			<UIcon
				name="i-material-symbols-progress-activity"
				class="size-5 animate-spin"
			/>
			Adding <strong class="text-highlighted">{{ domain }}</strong>…
		</div>
	</AuthCard>
	<AuthCard
		v-else
		title="Create your Organization"
		description="An Organization holds your Sites and the people who can see them. You can invite them later."
	>
		<UForm
			:schema="createOrganizationSchema"
			:state="state"
			class="flex flex-col gap-4"
			@submit="onSubmit"
		>
			<UFormField
				label="Name"
				name="name"
			>
				<UInput
					v-model="state.name"
					placeholder="Acme"
					autofocus
					class="w-full"
				/>
			</UFormField>
			<UFormField
				label="URL"
				name="slug"
				:help="`Your dashboard will live at /app/${state.slug || 'acme'}.`"
			>
				<UInput
					v-model="state.slug"
					placeholder="acme"
					class="w-full"
					@input="slugEdited = true"
				/>
			</UFormField>
			<UFormField
				v-if="domain"
				label="First Site"
			>
				<div class="flex items-center gap-2 text-sm text-highlighted">
					<DashboardSourceIcon :domain="domain" />
					{{ domain }}
				</div>
			</UFormField>
			<UButton
				type="submit"
				label="Create Organization"
				block
				:loading="loading"
			/>
		</UForm>
	</AuthCard>
</template>
