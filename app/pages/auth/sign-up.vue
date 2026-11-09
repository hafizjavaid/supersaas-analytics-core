<script setup lang="ts">
definePageMeta({ middleware: ["guest"] });
useHead({ title: "Create an account" });

const route = useRoute();
const redirect = computed(() => safeRedirect(route.query.redirect));
const domain = computed(() => domainOfOnboarding(redirect.value));
const { signUpOpen } = useDeployment();
</script>

<template>
	<AuthCard
		v-if="!offersSignUp(signUpOpen, redirect)"
		title="Sign-up is closed"
		description="Ask an Organization Owner or Admin to invite you, then open the link in the email."
	>
		<UButton
			:to="authPageLink('/auth/login', redirect)"
			label="Sign in"
			block
		/>
	</AuthCard>
	<AuthCard v-else>
		<AuthSignUpForm
			:redirect="redirect"
			@switch="navigateTo(authPageLink('/auth/login', redirect))"
		>
			<template
				v-if="domain"
				#heading
			>
				<AuthDomainHeading :domain="domain" />
			</template>
		</AuthSignUpForm>
	</AuthCard>
</template>
