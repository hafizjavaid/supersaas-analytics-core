<script setup lang="ts">
import type { DeviceDimension } from "#layers/core/shared/types/analytics";

const props = defineProps<{ dimension: DeviceDimension; value: string }>();

const BROWSER_ICONS: Record<string, string> = {
	"Chrome": "i-logos-chrome",
	"Safari": "i-logos-safari",
	"Firefox": "i-logos-firefox",
	"Edge": "i-logos-microsoft-edge",
	"Opera": "i-logos-opera",
	"Samsung Internet": "i-simple-icons-samsung",
	"Internet Explorer": "i-logos-internetexplorer",
};

const OS_ICONS: Record<string, string> = {
	Windows: "i-logos-microsoft-windows-icon",
	macOS: "i-simple-icons-apple",
	iOS: "i-simple-icons-apple",
	Android: "i-logos-android-icon",
	Linux: "i-logos-linux-tux",
	ChromeOS: "i-logos-chrome",
};

const DEVICE_ICONS: Record<string, string> = {
	mobile: "i-material-symbols-mobile-outline-rounded",
	tablet: "i-material-symbols-tablet-android-outline-rounded",
};

const DESKTOP_ICON = "i-material-symbols-desktop-windows-outline-rounded";

const icon = computed(() => {
	if (props.dimension === "browser") {
		return BROWSER_ICONS[props.value] ?? "i-material-symbols-web-outline-rounded";
	}
	if (props.dimension === "os") {
		return OS_ICONS[props.value] ?? DESKTOP_ICON;
	}
	return DEVICE_ICONS[props.value] ?? DESKTOP_ICON;
});

// Brand logos keep their own colours; monochrome marks take the muted text colour.
const isMonochrome = computed(() => !icon.value.startsWith("i-logos-"));
</script>

<template>
	<UIcon
		:name="icon"
		class="size-5 shrink-0"
		:class="{ 'text-muted': isMonochrome }"
	/>
</template>
