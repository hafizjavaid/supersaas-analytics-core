<script setup lang="ts">
defineProps<{ title?: string; description?: string }>();
</script>

<template>
	<div class="flex min-h-svh flex-col items-center justify-center gap-4 p-4">
		<UCard class="w-full max-w-sm marketing:shadow-marketing">
			<div class="flex flex-col gap-6 marketing:sm:p-2">
				<AuthHeading
					v-if="title"
					:title="title"
					:description="description"
				/>
				<slot />
			</div>
		</UCard>
		<AppPoweredBy />
	</div>
</template>
