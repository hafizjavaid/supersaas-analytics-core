<script setup lang="ts">
import type { OrganizationMembership } from "#layers/core/shared/types/organizations";

definePageMeta({ middleware: ["auth"] });
useHead({ title: "Accept invitation" });

const route = useRoute();
const { user, signOut } = useAuth();
const failure = ref<string>();
const accepting = ref(true);

onMounted(async () => {
	const { data, error } = await authClient().organization.acceptInvitation({ invitationId: String(route.params.id) });
	if (error || !data) {
		failure.value = error?.message ?? "This invitation could not be accepted.";
		accepting.value = false;
		return;
	}
	const organization = await $fetch<OrganizationMembership>(`/api/organizations/${data.member.organizationId}`);
	await authClient().organization.setActive({ organizationId: organization.id });
	await navigateTo(`/app/${organization.slug}`, { replace: true });
});
</script>

<template>
	<AuthCard
		:title="failure ? 'Invitation not accepted' : 'Joining the Organization'"
		:description="failure ? `${failure} You are signed in as ${user?.email}.` : 'One moment…'"
	>
		<UIcon
			v-if="accepting"
			name="i-material-symbols-progress-activity"
			class="mx-auto size-6 animate-spin text-muted"
		/>
		<template v-else>
			<UButton
				label="Sign in with another account"
				color="neutral"
				variant="soft"
				block
				@click="signOut()"
			/>
			<UButton
				to="/app"
				label="Go to my dashboard"
				color="neutral"
				variant="ghost"
				block
			/>
		</template>
	</AuthCard>
</template>
