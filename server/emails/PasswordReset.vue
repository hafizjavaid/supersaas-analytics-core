<script setup lang="ts">
import EmailLayout from "./EmailLayout.vue";

defineProps<{ url: string; appName: string }>();
</script>

<template>
	<EmailLayout
		preview="Reset your password"
		heading="Reset your password"
		action-label="Choose a new password"
		:action-url="url"
		:app-name="appName"
		footnote="If you did not ask to reset your password, you can ignore this email."
	>
		Someone asked to reset the password of your {{ appName }} account. The link expires in 30 minutes.
	</EmailLayout>
</template>
