<script setup lang="ts">
definePageMeta({ middleware: ["guest"] });
useHead({ title: "Sign in" });

const route = useRoute();
const redirect = computed(() => safeRedirect(route.query.redirect));
</script>

<template>
	<AuthCard>
		<AuthSignInForm
			:redirect="redirect"
			@switch="navigateTo(authPageLink('/auth/sign-up', redirect))"
			@magic-link="navigateTo(authPageLink('/auth/magic-link', redirect))"
		/>
	</AuthCard>
</template>
