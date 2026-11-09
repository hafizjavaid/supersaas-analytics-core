<script setup lang="ts">
definePageMeta({ middleware: ["guest"], needsEmail: true });
useHead({ title: "Sign in with email" });

const route = useRoute();
const redirect = computed(() => safeRedirect(route.query.redirect));
</script>

<template>
	<AuthCard>
		<AuthMagicLinkForm
			:redirect="redirect"
			@switch="navigateTo(authPageLink('/auth/login', redirect))"
		/>
	</AuthCard>
</template>
