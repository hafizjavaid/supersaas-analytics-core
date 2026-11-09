<script setup lang="ts">
import type { NavigationLink } from "#layers/core/app/utils/navigation";

defineProps<{ sections: NavigationLink[] }>();
</script>

<template>
	<div class="mx-auto flex w-full max-w-5xl flex-col gap-6 lg:flex-row lg:gap-10">
		<nav
			aria-label="Settings sections"
			class="shrink-0 overflow-x-auto lg:w-48"
		>
			<UNavigationMenu
				:items="sections"
				orientation="vertical"
				color="neutral"
				class="hidden lg:flex"
			/>
			<UNavigationMenu
				:items="sections"
				orientation="horizontal"
				color="neutral"
				class="lg:hidden"
			/>
		</nav>
		<div class="flex min-w-0 flex-1 flex-col gap-6">
			<slot />
		</div>
	</div>
</template>
