<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

useHead({ title: "Choose a new password" });

const route = useRoute();
const token = computed(() => typeof route.query.token === "string" ? route.query.token : undefined);
const notify = useNotify();

const schema = z.object({ password: z.string().min(8, "Use at least 8 characters").max(128) });
type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({ password: "" });
const loading = ref(false);

async function onSubmit(event: FormSubmitEvent<Schema>) {
	if (!token.value) {
		return;
	}
	loading.value = true;
	const { error } = await authClient().resetPassword({ newPassword: event.data.password, token: token.value });
	loading.value = false;
	if (error) {
		notify.error("Could not reset the password", null, error.message);
		return;
	}
	notify.success("Password changed", "Sign in with your new password.");
	await navigateTo("/auth/login");
}
</script>

<template>
	<AuthCard
		title="Choose a new password"
		:description="token ? undefined : 'This reset link is invalid or has expired.'"
	>
		<UForm
			v-if="token"
			:schema="schema"
			:state="state"
			class="flex flex-col gap-4"
			@submit="onSubmit"
		>
			<UFormField
				label="New password"
				name="password"
				help="At least 8 characters."
			>
				<UInput
					v-model="state.password"
					type="password"
					autocomplete="new-password"
					class="w-full"
				/>
			</UFormField>
			<UButton
				type="submit"
				label="Change password"
				block
				:loading="loading"
			/>
		</UForm>
		<UButton
			v-else
			to="/auth/forgot-password"
			label="Send a new link"
			color="neutral"
			variant="soft"
			block
		/>
	</AuthCard>
</template>
