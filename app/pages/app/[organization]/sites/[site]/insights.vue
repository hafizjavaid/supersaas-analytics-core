<script setup lang="ts">
import type { Digest } from "#layers/core/shared/types/digests";
import type { DigestSetting } from "#layers/core/shared/utils/digests";

useHead({ title: "Insights" });

const route = useRoute();
const router = useRouter();
const { site, api } = useSite();
const { basePath } = useOrganization();
const live = useLiveVisitors(api);
const { email: canEmail } = useDeployment();
const { settingOf, choose } = await useDigestSubscriptions();
const { data: digests, status } = await useFetch<Digest[]>(() => `${api.value}/digests`, { default: () => [] });

const mySetting = computed(() => settingOf(site.value.id));
const selected = computed(() => digests.value.find(digest => digest.id === route.query.digest) ?? digests.value[0] ?? null);

function select(digest: Digest) {
	router.replace({ query: { ...route.query, digest: digest.id } });
}

function visitorsChange(digest: Digest) {
	const { current, previous } = digest.report.figures.visitors;
	return valueChange(current, previous);
}
</script>

<template>
	<AppPanel id="site-insights">
		<template #title>
			<SiteHeader
				:site="site"
				:live="live"
			/>
		</template>
		<template
			v-if="canEmail"
			#right
		>
			<USelect
				:model-value="mySetting"
				:items="digestSettingItems"
				icon="i-material-symbols-mail-outline-rounded"
				size="sm"
				class="w-36"
				aria-label="Email me this Site's Digest"
				@update:model-value="frequency => choose(site.id, frequency as DigestSetting)"
			/>
		</template>

		<UEmpty
			v-if="!digests.length && status !== 'pending'"
			icon="i-material-symbols-lightbulb-outline-rounded"
			title="No Digests yet"
			:description="canEmail ? 'A weekly Digest is written after each Sunday and a monthly one after each month, once the Site has traffic. Daily ones are written for Members who choose them.' : 'Digests are emailed, and this server sends no email. Set up Resend or SMTP to get them.'"
			:actions="canEmail ? [{ label: 'Choose your Digests', to: `${basePath}/settings/digests`, color: 'neutral', variant: 'subtle' }] : []"
		/>

		<div
			v-else-if="selected"
			class="grid gap-4 lg:grid-cols-[18rem_minmax(0,1fr)]"
		>
			<nav
				aria-label="Past Digests"
				class="flex flex-col gap-1 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
			>
				<button
					v-for="digest in digests"
					:key="digest.id"
					type="button"
					class="flex items-center gap-2 rounded-md px-3 py-2 text-left text-sm transition-colors hover:bg-elevated"
					:class="digest.id === selected.id ? 'bg-elevated text-highlighted' : 'text-default'"
					:aria-current="digest.id === selected.id ? 'true' : undefined"
					@click="select(digest)"
				>
					<span class="min-w-0 flex-1">
						<span class="block truncate font-medium">{{ digestPeriodLabel(digest.frequency, digest) }}</span>
						<span class="block text-xs text-muted">{{ DIGEST_TITLES[digest.frequency] }}</span>
					</span>
					<span
						v-if="visitorsChange(digest)"
						class="rounded px-1.5 py-0.5 text-xs font-medium tabular-nums"
						:class="CHANGE_PILL_CLASSES[visitorsChange(digest)!.tone]"
					>{{ visitorsChange(digest)!.label }}</span>
				</button>
			</nav>

			<section class="flex min-w-0 flex-col gap-4">
				<header>
					<h2 class="text-lg font-semibold text-highlighted">
						{{ DIGEST_TITLES[selected.frequency] }} · {{ digestPeriodLabel(selected.frequency, selected) }}
					</h2>
					<p class="text-sm text-muted">
						Compared with {{ formatDateSpan(selected.report.previousPeriod) }}.
					</p>
				</header>
				<DashboardDigestReport :digest="selected" />
			</section>
		</div>
	</AppPanel>
</template>
