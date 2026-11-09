<script setup lang="ts">
useHead({
	title: "Analytics",
	meta: [
		{ name: "viewport", content: "width=device-width, initial-scale=1" },
		{ name: "robots", content: "noindex, nofollow" },
	],
	link: [
		{ rel: "icon", href: "/favicon.ico", sizes: "32x32" },
		{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
	],
	htmlAttrs: {
		lang: "en",
	},
});
</script>

<template>
	<UApp>
		<NuxtLayout>
			<NuxtPage />
		</NuxtLayout>
		<AppNotice />
	</UApp>
</template>
