<script setup lang="ts">
import type { FormSubmitEvent } from "@nuxt/ui";
import { inviteMemberSchema } from "#layers/core/shared/schemas/organizations";
import type { InviteMemberInput } from "#layers/core/shared/schemas/organizations";

const open = defineModel<boolean>("open", { default: false });
const emit = defineEmits<{ invited: [] }>();

const { organization } = useOrganization();
const { email: canEmail } = useDeployment();
const notify = useNotify();
const { copy, copied } = useClipboard({ copiedDuring: 2000 });
const state = reactive<InviteMemberInput>({ email: "", role: "viewer" });
const pending = ref(false);
const acceptUrl = ref<string>();
const roleItems = invitableRoles.map(role => ({ label: memberRoleLabels[role], value: role }));

watch(open, (isOpen) => {
	if (isOpen) {
		acceptUrl.value = undefined;
	}
});

async function invite(event: FormSubmitEvent<InviteMemberInput>) {
	pending.value = true;
	const { data, error } = await authClient().organization.inviteMember({ ...event.data, organizationId: organization.value.id });
	pending.value = false;
	if (error) {
		notify.error("Could not send the invite", null, error.message);
		return;
	}
	Object.assign(state, { email: "", role: "viewer" });
	emit("invited");
	const url = (data as { url?: string } | null)?.url;
	if (url) {
		acceptUrl.value = url;
		return;
	}
	notify.success("Invite sent", `We emailed ${event.data.email} a link to join ${organization.value.name}.`);
	open.value = false;
}
</script>

<template>
	<UModal
		v-model:open="open"
		:title="`Invite someone to ${organization.name}`"
		:description="canEmail ? 'They get an email with a link to join. Accepting needs a verified email address.' : 'This server sends no email, so you get a link to send them yourself.'"
	>
		<template #body>
			<div
				v-if="acceptUrl"
				class="grid gap-2"
			>
				<p class="text-sm text-muted">
					Send this link to them. It works once, for that email address.
				</p>
				<UInput
					:model-value="acceptUrl"
					readonly
					class="w-full"
					aria-label="Invite link"
				>
					<template #trailing>
						<UButton
							:icon="copied ? 'i-material-symbols-check-rounded' : 'i-material-symbols-content-copy-outline-rounded'"
							color="neutral"
							variant="link"
							size="sm"
							:aria-label="copied ? 'Copied' : 'Copy link'"
							@click="copy(acceptUrl)"
						/>
					</template>
				</UInput>
			</div>
			<UForm
				v-else
				id="invite-member-form"
				:schema="inviteMemberSchema"
				:state="state"
				class="grid gap-4"
				@submit="invite"
			>
				<UFormField
					label="Email"
					name="email"
					required
				>
					<UInput
						v-model="state.email"
						type="email"
						placeholder="name@example.com"
						class="w-full"
					/>
				</UFormField>
				<UFormField
					label="Role"
					name="role"
					description="Admins manage Sites and Members. Viewers see dashboards."
				>
					<USelect
						v-model="state.role"
						:items="roleItems"
						class="w-full"
					/>
				</UFormField>
			</UForm>
		</template>
		<template #footer="{ close }">
			<div
				v-if="acceptUrl"
				class="flex w-full justify-end"
			>
				<UButton
					label="Done"
					@click="close"
				/>
			</div>
			<div
				v-else
				class="flex w-full justify-end gap-2"
			>
				<UButton
					label="Cancel"
					color="neutral"
					variant="outline"
					@click="close"
				/>
				<UButton
					type="submit"
					form="invite-member-form"
					:label="canEmail ? 'Send invite' : 'Create invite link'"
					:loading="pending"
				/>
			</div>
		</template>
	</UModal>
</template>
