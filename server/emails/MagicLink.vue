<script setup lang="ts">
import EmailLayout from "./EmailLayout.vue";

defineProps<{ url: string; appName: string; expiresInMinutes: number }>();
</script>

<template>
	<EmailLayout
		preview="Your sign-in link"
		heading="Sign in"
		action-label="Sign in"
		:action-url="url"
		:app-name="appName"
		footnote="If you did not ask for this link, you can ignore this email."
	>
		Use this link to sign in to {{ appName }}. It expires in {{ expiresInMinutes }} minutes.
	</EmailLayout>
</template>
