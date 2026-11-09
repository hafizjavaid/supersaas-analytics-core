<script setup lang="ts">
import { z } from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";
import type { AdminUser } from "#layers/core/shared/types/admin";

const props = defineProps<{ user: AdminUser | null }>();
const open = defineModel<boolean>("open", { default: false });

const schema = z.object({
	password: z.string().min(8, "Use at least 8 characters").max(128),
});
type Schema = z.output<typeof schema>;

const notify = useNotify();
const state = reactive<Partial<Schema>>({ password: "" });
const pending = ref(false);

watch(open, () => {
	state.password = "";
});

async function submit(event: FormSubmitEvent<Schema>) {
	if (!props.user) {
		return;
	}
	pending.value = true;
	const { error } = await authClient().admin.setUserPassword({ userId: props.user.id, newPassword: event.data.password });
	pending.value = false;
	if (error) {
		notify.error("Could not set the password", null, error.message);
		return;
	}
	open.value = false;
	notify.success("Password set", `Send it to ${props.user.email} yourself.`);
}
</script>

<template>
	<UModal
		v-model:open="open"
		title="Set password"
		:description="user ? `A new password for ${user.email}. They sign in with it from now on.` : undefined"
	>
		<template #body>
			<UForm
				id="set-password-form"
				:schema="schema"
				:state="state"
				@submit="submit"
			>
				<UFormField
					label="New password"
					name="password"
					required
				>
					<UInput
						v-model="state.password"
						type="password"
						autocomplete="new-password"
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
					form="set-password-form"
					label="Set password"
					:loading="pending"
				/>
			</div>
		</template>
	</UModal>
</template>
