<script setup lang="ts">
const props = defineProps<{ callbackUrl: string }>();

const { data: providers } = await useFetch("/api/auth-providers", { key: "auth-providers" });
const notify = useNotify();
const pending = ref<"google" | "github">();

async function signInWith(provider: "google" | "github") {
	pending.value = provider;
	const { error } = await authClient().signIn.social({ provider, callbackURL: props.callbackUrl });
	if (error) {
		notify.error("Could not sign in", null, error.message);
		pending.value = undefined;
	}
}
</script>

<template>
	<div
		v-if="providers?.google || providers?.github"
		class="flex flex-col gap-3"
	>
		<USeparator label="or" />
		<AuthLastUsed
			v-if="providers.google"
			method="google"
		>
			<UButton
				label="Continue with Google"
				icon="i-logos-google-icon"
				color="neutral"
				variant="outline"
				block
				:loading="pending === 'google'"
				@click="signInWith('google')"
			/>
		</AuthLastUsed>
		<AuthLastUsed
			v-if="providers.github"
			method="github"
		>
			<UButton
				label="Continue with GitHub"
				icon="i-simple-icons-github"
				color="neutral"
				variant="outline"
				block
				:loading="pending === 'github'"
				@click="signInWith('github')"
			/>
		</AuthLastUsed>
	</div>
</template>
