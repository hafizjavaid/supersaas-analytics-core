<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

definePageMeta({ middleware: ["guest"], needsEmail: true });
useHead({ title: "Reset your password" });

const notify = useNotify();

const schema = z.object({ email: z.email("Enter a valid email") });
type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({ email: "" });
const loading = ref(false);
const sent = ref(false);

async function onSubmit(event: FormSubmitEvent<Schema>) {
	loading.value = true;
	const { error } = await authClient().requestPasswordReset({ email: event.data.email, redirectTo: "/auth/reset-password" });
	loading.value = false;
	if (error) {
		notify.error("Could not send the email", null, error.message);
		return;
	}
	sent.value = true;
}
</script>

<template>
	<AuthCard
		title="Reset your password"
		:description="sent ? 'If an account uses that email, a reset link is on its way. It expires in 30 minutes.' : 'Enter your email and we will send you a reset link.'"
	>
		<UForm
			v-if="!sent"
			:schema="schema"
			:state="state"
			class="flex flex-col gap-4"
			@submit="onSubmit"
		>
			<UFormField
				label="Email"
				name="email"
			>
				<UInput
					v-model="state.email"
					type="email"
					autocomplete="email"
					class="w-full"
				/>
			</UFormField>
			<UButton
				type="submit"
				label="Send reset link"
				block
				:loading="loading"
			/>
		</UForm>

		<ULink
			to="/auth/login"
			class="text-center text-sm text-primary"
		>
			Back to sign in
		</ULink>
	</AuthCard>
</template>
