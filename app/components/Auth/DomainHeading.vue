<script setup lang="ts">
defineProps<{ domain: string }>();
</script>

<template>
	<div class="flex items-start gap-3">
		<DashboardSourceIcon
			:domain="domain"
			class="mt-1"
		/>
		<h1 class="text-xl font-medium text-pretty text-highlighted marketing:marketing-heading marketing:text-2xl">
			Create a free account to discover <strong class="font-bold marketing:text-primary">{{ domain }}</strong>'s best marketing channels
		</h1>
	</div>
</template>
