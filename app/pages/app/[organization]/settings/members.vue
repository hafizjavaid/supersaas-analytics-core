<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";
import type { Confirmation } from "#layers/core/app/components/App/ConfirmModal.vue";
import type { OrganizationMember, OrganizationMembers } from "#layers/core/shared/types/organizations";

useHead({ title: "Members" });

const { organization, refresh: refreshOrganization, can } = useOrganization();
const { user } = useAuth();
const notify = useNotify();
const { email: canEmail } = useDeployment();
const { copy } = useClipboard();
const origin = useRequestURL().origin;
const { data, refresh } = await useFetch<OrganizationMembers>(`/api/organizations/${organization.value.id}/members`, {
	key: `members:${organization.value.id}`,
	default: () => ({ members: [], invitations: [] }),
});

const inviteOpen = ref(false);
const confirmation = ref<Confirmation | null>(null);
const roleItems = invitableRoles.map(role => ({ label: memberRoleLabels[role], value: role }));

function roleLabel(role: string | null) {
	return isMemberRole(role) ? memberRoleLabels[role] : role ?? "";
}

function isSelf(member: OrganizationMember) {
	return member.userId === user.value?.id;
}

function canChangeRole(member: OrganizationMember) {
	return member.role !== "owner" && !isSelf(member) && can({ member: ["update"] });
}

async function changeRole(member: OrganizationMember, role: InvitableRole) {
	const { error } = await authClient().organization.updateMemberRole({ memberId: member.id, role, organizationId: organization.value.id });
	if (error) {
		notify.error("Could not change the role", null, error.message);
	}
	else {
		notify.success("Role changed", `${member.name} is now ${memberRoleLabels[role]}.`);
	}
	await refresh();
}

function confirmRemove(member: OrganizationMember) {
	confirmation.value = {
		title: `Remove ${member.name}?`,
		description: `${member.email} loses access to ${organization.value.name} and its Sites.`,
		confirmLabel: "Remove",
		run: async () => {
			const { error } = await authClient().organization.removeMember({ memberIdOrEmail: member.id, organizationId: organization.value.id });
			if (error) {
				notify.error("Could not remove the Member", null, error.message);
				return false;
			}
			notify.success("Member removed", `${member.name} no longer has access.`);
			await refresh();
			return true;
		},
	};
}

function confirmTransfer(member: OrganizationMember) {
	confirmation.value = {
		title: `Make ${member.name} the Owner?`,
		description: `${member.name} becomes the Owner of ${organization.value.name} and you become an Admin. Only the new Owner can undo this.`,
		confirmLabel: "Transfer ownership",
		run: async () => {
			try {
				await $fetch(`/api/organizations/${organization.value.id}/transfer-ownership`, { method: "POST", body: { memberId: member.id } });
			}
			catch (caught) {
				notify.error("Could not transfer ownership", caught);
				return false;
			}
			notify.success("Ownership transferred", `${member.name} is now the Owner.`);
			await Promise.all([refresh(), refreshOrganization(), refreshNuxtData("organizations")]);
			return true;
		},
	};
}

function confirmLeave() {
	confirmation.value = {
		title: `Leave ${organization.value.name}?`,
		description: "You lose access to its Sites until someone invites you again.",
		confirmLabel: "Leave",
		run: async () => {
			const { error } = await authClient().organization.leave({ organizationId: organization.value.id });
			if (error) {
				notify.error("Could not leave the Organization", null, error.message);
				return false;
			}
			clearNuxtData();
			await navigateTo("/app", { replace: true });
			return true;
		},
	};
}

async function cancelInvitation(invitationId: string, email: string) {
	const { error } = await authClient().organization.cancelInvitation({ invitationId });
	if (error) {
		notify.error("Could not cancel the invite", null, error.message);
		return;
	}
	notify.success("Invite cancelled", `The link sent to ${email} no longer works.`);
	await refresh();
}

async function copyInvitationLink(invitationId: string) {
	await copy(`${origin}${acceptInvitationPath(invitationId)}`);
	notify.success("Invite link copied");
}

function memberActions(member: OrganizationMember): DropdownMenuItem[] {
	if (isSelf(member)) {
		return member.role === "owner" ? [] : [{ label: "Leave Organization", icon: "i-material-symbols-logout-rounded", color: "error", onSelect: confirmLeave }];
	}
	if (member.role === "owner") {
		return [];
	}
	return [
		...(can({ ownership: ["transfer"] }) ? [{ label: "Make Owner", icon: "i-material-symbols-swap-horiz-rounded", onSelect: () => confirmTransfer(member) }] : []),
		...(can({ member: ["delete"] }) ? [{ label: "Remove", icon: "i-material-symbols-delete-outline-rounded", color: "error" as const, onSelect: () => confirmRemove(member) }] : []),
	];
}
</script>

<template>
	<UCard :ui="{ body: 'p-0 sm:p-0' }">
		<template #header>
			<div class="flex items-start justify-between gap-4">
				<div>
					<h2 class="font-semibold text-highlighted">
						Members
					</h2>
					<p class="text-sm text-muted">
						Owners and Admins manage Sites and Members. Viewers see dashboards.
					</p>
				</div>
				<UButton
					v-if="can({ invitation: ['create'] })"
					label="Invite"
					icon="i-material-symbols-person-add-outline-rounded"
					@click="inviteOpen = true"
				/>
			</div>
		</template>

		<ul class="divide-y divide-default">
			<li
				v-for="member in data.members"
				:key="member.id"
				class="flex items-center gap-3 px-4 py-3 sm:px-6"
			>
				<UAvatar
					:src="member.image ?? undefined"
					:alt="member.name"
					size="sm"
				/>
				<div class="min-w-0 flex-1">
					<p class="truncate font-medium text-highlighted">
						{{ member.name }}
						<span
							v-if="isSelf(member)"
							class="font-normal text-muted"
						>(you)</span>
					</p>
					<p class="truncate text-sm text-muted">
						{{ member.email }}
					</p>
				</div>
				<USelect
					v-if="canChangeRole(member)"
					:model-value="member.role as InvitableRole"
					:items="roleItems"
					size="sm"
					class="w-28"
					:aria-label="`Role of ${member.name}`"
					@update:model-value="role => changeRole(member, role as InvitableRole)"
				/>
				<UBadge
					v-else
					:label="roleLabel(member.role)"
					:color="member.role === 'owner' ? 'primary' : 'neutral'"
					variant="subtle"
				/>
				<UDropdownMenu
					v-if="memberActions(member).length"
					:items="memberActions(member)"
					:content="{ align: 'end' }"
				>
					<UButton
						icon="i-material-symbols-more-horiz"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="`Actions for ${member.name}`"
					/>
				</UDropdownMenu>
				<span
					v-else
					class="w-8"
				/>
			</li>
		</ul>
	</UCard>

	<UCard
		v-if="data.invitations.length"
		:ui="{ body: 'p-0 sm:p-0' }"
	>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Pending invites
			</h2>
		</template>
		<ul class="divide-y divide-default">
			<li
				v-for="invitation in data.invitations"
				:key="invitation.id"
				class="flex items-center gap-3 px-4 py-3 sm:px-6"
			>
				<UIcon
					name="i-material-symbols-mail-outline-rounded"
					class="size-5 shrink-0 text-muted"
				/>
				<p class="min-w-0 flex-1 truncate text-sm">
					{{ invitation.email }}
				</p>
				<UBadge
					:label="roleLabel(invitation.role)"
					color="neutral"
					variant="subtle"
				/>
				<UButton
					v-if="!canEmail && can({ invitation: ['create'] })"
					label="Copy link"
					icon="i-material-symbols-content-copy-outline-rounded"
					color="neutral"
					variant="ghost"
					size="sm"
					@click="copyInvitationLink(invitation.id)"
				/>
				<UButton
					v-if="can({ invitation: ['cancel'] })"
					label="Cancel"
					color="neutral"
					variant="ghost"
					size="sm"
					@click="cancelInvitation(invitation.id, invitation.email)"
				/>
			</li>
		</ul>
	</UCard>

	<OrganizationInviteModal
		v-model:open="inviteOpen"
		@invited="refresh"
	/>
	<AppConfirmModal v-model="confirmation" />
</template>
