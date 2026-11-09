<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const props = defineProps<{ redirect: string }>();
const emit = defineEmits<{ switch: [] }>();

const notify = useNotify();
const { refreshSession } = useAuth();
const { email: canEmail } = useDeployment();

const schema = z.object({
	name: z.string().trim().min(1, "Enter your name"),
	email: z.email("Enter a valid email"),
	password: z.string().min(8, "Use at least 8 characters").max(128),
});
type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({ name: "", email: "", password: "" });
const loading = ref(false);
const sentTo = ref<string>();

async function onSubmit(event: FormSubmitEvent<Schema>) {
	loading.value = true;
	const { error } = await authClient().signUp.email({ ...event.data, callbackURL: props.redirect });
	if (error) {
		loading.value = false;
		notify.error("Could not create the account", null, error.message);
		return;
	}
	if (canEmail.value) {
		loading.value = false;
		sentTo.value = event.data.email;
		return;
	}
	await signInWithoutVerification(event.data);
}

// A server without email verifies new accounts on creation, so they sign in straight away.
async function signInWithoutVerification({ email, password }: Schema) {
	const { error } = await authClient().signIn.email({ email, password });
	loading.value = false;
	if (error) {
		notify.error("Could not sign in", null, error.message);
		return;
	}
	await refreshSession();
	await navigateTo(props.redirect);
}

async function resend() {
	if (!sentTo.value) {
		return;
	}
	const { error } = await authClient().sendVerificationEmail({ email: sentTo.value, callbackURL: props.redirect });
	if (error) {
		notify.error("Could not send the email", null, error.message);
		return;
	}
	notify.success("Verification email sent");
}
</script>

<template>
	<div
		v-if="sentTo"
		class="flex flex-col gap-6"
	>
		<AuthHeading
			title="Check your email"
			:description="`We sent a verification link to ${sentTo}. Open it to finish signing up.`"
		/>
		<UButton
			label="Resend the email"
			color="neutral"
			variant="soft"
			block
			@click="resend"
		/>
		<UButton
			label="Use another email"
			color="neutral"
			variant="ghost"
			block
			@click="sentTo = undefined"
		/>
	</div>

	<div
		v-else
		class="flex flex-col gap-6"
	>
		<slot name="heading">
			<AuthHeading
				title="Create an account"
				description="Start tracking your sites without cookies."
			/>
		</slot>

		<UForm
			:schema="schema"
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
					autocomplete="name"
					class="w-full"
				/>
			</UFormField>
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
			<UFormField
				label="Password"
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
				label="Create account"
				block
				:loading="loading"
			/>
		</UForm>

		<AuthSocialButtons :callback-url="redirect" />

		<p class="text-center text-sm text-muted">
			Already have an account?
			<AuthSwitchLink
				:to="authPageLink('/auth/login', redirect)"
				@switch="emit('switch')"
			>
				Sign in
			</AuthSwitchLink>
		</p>
	</div>
</template>
