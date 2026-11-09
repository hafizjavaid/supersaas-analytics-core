<script setup lang="ts">
defineProps<{ title: string; description: string; icon: string }>();
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				{{ title }}
			</h2>
			<p class="text-sm text-muted">
				{{ description }}
			</p>
		</template>
		<UEmpty
			:icon="icon"
			title="Not available yet"
			description="This section arrives in a coming release."
			variant="naked"
		/>
	</UCard>
</template>
