<script setup lang="ts">
import * as z from "zod";
import type { FormSubmitEvent } from "@nuxt/ui";

const props = defineProps<{ redirect: string }>();
const emit = defineEmits<{ switch: [] }>();

const notify = useNotify();

const schema = z.object({ email: z.email("Enter a valid email") });
type Schema = z.output<typeof schema>;

const state = reactive<Partial<Schema>>({ email: "" });
const loading = ref(false);
const sentTo = ref<string>();

async function send(email: string) {
	loading.value = true;
	const { error } = await authClient().signIn.magicLink({ email, callbackURL: props.redirect });
	loading.value = false;
	if (error) {
		notify.error("Could not send the link", null, error.message);
		return;
	}
	sentTo.value = email;
}

function onSubmit(event: FormSubmitEvent<Schema>) {
	return send(event.data.email);
}
</script>

<template>
	<div class="flex flex-col gap-6">
		<AuthHeading
			title="Sign in with email"
			:description="sentTo ? `We sent a sign-in link to ${sentTo}. It expires in 10 minutes.` : 'We will email you a link that signs you in.'"
		/>
		<UButton
			v-if="sentTo"
			label="Send another link"
			color="neutral"
			variant="soft"
			block
			:loading="loading"
			@click="send(sentTo)"
		/>
		<UForm
			v-else
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
				label="Email me a link"
				block
				:loading="loading"
			/>
		</UForm>

		<AuthSwitchLink
			:to="authPageLink('/auth/login', redirect)"
			class="text-center text-sm"
			@switch="emit('switch')"
		>
			Sign in with a password
		</AuthSwitchLink>
	</div>
</template>
