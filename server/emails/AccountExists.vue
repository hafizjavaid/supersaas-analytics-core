<script setup lang="ts">
import EmailLayout from "./EmailLayout.vue";

defineProps<{ url: string; appName: string }>();
</script>

<template>
	<EmailLayout
		preview="You already have an account"
		heading="You already have an account"
		action-label="Sign in"
		:action-url="url"
		:app-name="appName"
		footnote="If you did not try to sign up, you can ignore this email. Your account has not changed."
	>
		Someone tried to create a {{ appName }} account with this email, which already has one. Sign in instead, or choose
		"Forgot password?" on the sign-in page to set a new password.
	</EmailLayout>
</template>
