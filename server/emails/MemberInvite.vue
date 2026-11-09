<script setup lang="ts">
import EmailLayout from "./EmailLayout.vue";

defineProps<{ url: string; appName: string; inviterName: string; organizationName: string; role: string }>();
</script>

<template>
	<EmailLayout
		:preview="`Join ${organizationName} on ${appName}`"
		:heading="`${inviterName} invited you to ${organizationName}`"
		action-label="Accept invitation"
		:action-url="url"
		:app-name="appName"
		footnote="If you were not expecting this invitation, you can ignore this email."
	>
		You are invited to join {{ organizationName }} on {{ appName }} as {{ role === "admin" ? "an Admin" : "a Viewer" }}.
	</EmailLayout>
</template>
