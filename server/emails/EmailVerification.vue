<script setup lang="ts">
import EmailLayout from "./EmailLayout.vue";

defineProps<{ url: string; appName: string }>();
</script>

<template>
	<EmailLayout
		preview="Verify your email"
		heading="Verify your email"
		action-label="Verify email"
		:action-url="url"
		:app-name="appName"
		footnote="If you did not create an account, you can ignore this email."
	>
		Confirm your email address to finish setting up your {{ appName }} account. The link expires in 1 hour.
	</EmailLayout>
</template>
