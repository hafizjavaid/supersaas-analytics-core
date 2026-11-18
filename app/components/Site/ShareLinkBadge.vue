<script setup lang="ts">
import type { ShareLink } from "#layers/core/shared/types/analytics";
import type { BadgeSize, BadgeTheme } from "#layers/core/shared/utils/badges";
import { BADGE_SIZES, badgeImagePath, badgeSnippet } from "#layers/core/shared/utils/badges";

const props = defineProps<{ link: ShareLink; domain: string }>();

const origin = useRequestURL().origin;
const theme = ref<BadgeTheme>("auto");
const size = ref<BadgeSize>("small");
const { copy, copied } = useClipboard({ copiedDuring: 2000 });

const themeOptions: { value: BadgeTheme; label: string }[] = [
	{ value: "auto", label: "Auto" },
	{ value: "light", label: "Light" },
	{ value: "dark", label: "Dark" },
];
const sizeOptions: { value: BadgeSize; label: string }[] = [
	{ value: "small", label: "Small" },
	{ value: "wide", label: "Wide" },
];

const snippet = computed(() => badgeSnippet({ origin, token: props.link.token, domain: props.domain, theme: theme.value, size: size.value }));
const preview = computed(() => ({ src: badgeImagePath(props.link.token, theme.value, size.value), ...BADGE_SIZES[size.value] }));
const clicks = computed(() => `${props.link.badgeClicks.toLocaleString("en-US")} Badge ${props.link.badgeClicks === 1 ? "click" : "clicks"}`);
</script>

<template>
	<div class="flex flex-col gap-3 rounded-md bg-elevated/50 p-3">
		<div class="flex flex-wrap items-center justify-between gap-2">
			<p class="text-sm text-muted">
				This link is public now: anyone who sees the Badge can open the dashboard.
			</p>
			<span class="text-sm text-highlighted tabular-nums">{{ clicks }}</span>
		</div>
		<div class="flex flex-wrap items-center gap-3">
			<UFieldGroup
				role="group"
				:aria-label="`Badge theme for ${link.name}`"
			>
				<UButton
					v-for="option in themeOptions"
					:key="option.value"
					:label="option.label"
					size="sm"
					color="neutral"
					:variant="theme === option.value ? 'soft' : 'ghost'"
					:aria-pressed="theme === option.value"
					@click="theme = option.value"
				/>
			</UFieldGroup>
			<UFieldGroup
				role="group"
				:aria-label="`Badge size for ${link.name}`"
			>
				<UButton
					v-for="option in sizeOptions"
					:key="option.value"
					:label="option.label"
					size="sm"
					color="neutral"
					:variant="size === option.value ? 'soft' : 'ghost'"
					:aria-pressed="size === option.value"
					@click="size = option.value"
				/>
			</UFieldGroup>
		</div>
		<img
			:src="preview.src"
			:width="preview.width"
			:height="preview.height"
			:alt="`Preview of the Badge for ${domain}`"
			class="max-w-full"
		>
		<div class="flex items-start gap-2 rounded-md bg-elevated p-3">
			<pre class="min-w-0 flex-1 overflow-x-auto font-mono text-xs">{{ snippet }}</pre>
			<UTooltip :text="copied ? 'Snippet copied' : 'Copy snippet'">
				<UButton
					:icon="copied ? 'i-material-symbols-check-rounded' : 'i-material-symbols-content-copy-outline-rounded'"
					color="neutral"
					variant="ghost"
					size="sm"
					:aria-label="`Copy the Badge snippet for ${link.name}`"
					@click="copy(snippet)"
				/>
			</UTooltip>
		</div>
	</div>
</template>
