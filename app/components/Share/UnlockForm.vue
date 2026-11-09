<script setup lang="ts">
import { FetchError } from "ofetch";

const props = defineProps<{ api: string }>();
const emit = defineEmits<{ unlocked: [] }>();

const password = ref("");
const loading = ref(false);
const wrongPassword = ref(false);
const notify = useNotify();

async function onSubmit() {
	loading.value = true;
	wrongPassword.value = false;
	try {
		await $fetch(`${props.api}/unlock`, { method: "POST", body: { password: password.value } });
		emit("unlocked");
	}
	catch (caught) {
		if (caught instanceof FetchError && caught.statusCode === 401) {
			wrongPassword.value = true;
		}
		else {
			notify.error("Could not open the dashboard", caught);
		}
	}
	finally {
		loading.value = false;
	}
}
</script>

<template>
	<AuthCard
		title="This dashboard is protected"
		description="Enter the password that came with the link."
	>
		<form
			class="flex flex-col gap-4"
			@submit.prevent="onSubmit"
		>
			<UFormField
				label="Password"
				name="password"
				:error="wrongPassword ? 'Wrong password' : undefined"
			>
				<UInput
					v-model="password"
					type="password"
					autocomplete="current-password"
					autofocus
					required
					class="w-full"
				/>
			</UFormField>
			<UButton
				type="submit"
				label="View dashboard"
				block
				:loading="loading"
				:disabled="!password"
			/>
		</form>
	</AuthCard>
</template>
