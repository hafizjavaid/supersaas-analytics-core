<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const props = defineProps<{ redirect: string }>();
const emit = defineEmits<{ "switch": []; "magic-link": [] }>();

const { refreshSession } = useAuth();
const { signUpOpen, email: canEmail } = useDeployment();
const notify = useNotify();
const toast = useToast();

const schema = z.object({
	email: z.email("Enter a valid email"),
	password: z.string().min(1, "Enter your password"),
});
type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({ email: "", password: "" });
const loading = ref(false);

async function resendVerification(email: string) {
	const { error } = await authClient().sendVerificationEmail({ email, callbackURL: props.redirect });
	if (error) {
		notify.error("Could not send the email", null, error.message);
		return;
	}
	notify.success("Verification email sent", `Check ${email} for the link.`);
}

async function onSubmit(event: FormSubmitEvent<Schema>) {
	loading.value = true;
	const { error } = await authClient().signIn.email({ ...event.data, callbackURL: props.redirect });
	loading.value = false;
	if (error?.code === "EMAIL_NOT_VERIFIED") {
		toast.add({
			title: "Verify your email first",
			description: "Open the link we emailed you, then sign in.",
			color: "warning",
			actions: [{ label: "Resend email", onClick: () => resendVerification(event.data.email) }],
		});
		return;
	}
	if (error) {
		notify.error("Could not sign in", null, error.message);
		return;
	}
	await refreshSession();
	await navigateTo(props.redirect);
}

function onMagicLinkClick(event: MouseEvent) {
	if (isPlainLeftClick(event)) {
		event.preventDefault();
		emit("magic-link");
	}
}
</script>

<template>
	<div class="flex flex-col gap-6">
		<slot name="heading">
			<AuthHeading
				title="Sign in"
				description="Welcome back."
			/>
		</slot>

		<UForm
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
			<UFormField
				label="Password"
				name="password"
			>
				<template
					v-if="canEmail"
					#hint
				>
					<ULink
						to="/auth/forgot-password"
						class="text-xs"
					>
						Forgot password?
					</ULink>
				</template>
				<UInput
					v-model="state.password"
					type="password"
					autocomplete="current-password"
					class="w-full"
				/>
			</UFormField>
			<AuthLastUsed method="email">
				<UButton
					type="submit"
					label="Sign in"
					block
					:loading="loading"
				/>
			</AuthLastUsed>
		</UForm>

		<AuthLastUsed
			v-if="canEmail"
			method="magic-link"
		>
			<UButton
				:to="authPageLink('/auth/magic-link', redirect)"
				label="Email me a sign-in link"
				icon="i-material-symbols-mail-outline-rounded"
				color="neutral"
				variant="soft"
				block
				@click="onMagicLinkClick"
			/>
		</AuthLastUsed>

		<AuthSocialButtons :callback-url="redirect" />

		<p
			v-if="offersSignUp(signUpOpen, redirect)"
			class="text-center text-sm text-muted"
		>
			New here?
			<AuthSwitchLink
				:to="authPageLink('/auth/sign-up', redirect)"
				@switch="emit('switch')"
			>
				Create an account
			</AuthSwitchLink>
		</p>
	</div>
</template>
