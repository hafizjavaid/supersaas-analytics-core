<script setup lang="ts">
import type { DigestSetting } from "#layers/core/shared/utils/digests";

definePageMeta({ needsEmail: true });
useHead({ title: "Digests" });

const { basePath } = useOrganization();
const { subscriptions, choose } = await useDigestSubscriptions();
</script>

<template>
	<UCard :ui="{ body: 'p-0 sm:p-0' }">
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Digests
			</h2>
			<p class="text-sm text-muted">
				A summary of each Site's numbers and what changed, emailed to you. Weekly Digests arrive after Sunday and monthly
				ones after the month ends. These settings are yours alone; every Member chooses their own.
			</p>
		</template>

		<ul
			v-if="subscriptions.length"
			class="divide-y divide-default"
		>
			<li
				v-for="subscription in subscriptions"
				:key="subscription.siteId"
				class="flex items-center gap-3 px-4 py-3 sm:px-6"
			>
				<div class="min-w-0 flex-1">
					<p class="truncate font-medium text-highlighted">
						{{ subscription.siteName }}
					</p>
					<ULink
						:to="`${basePath}/sites/${subscription.siteId}/insights`"
						class="truncate text-sm text-muted"
					>
						{{ subscription.siteDomain }} · past Digests
					</ULink>
				</div>
				<USelect
					:model-value="subscription.frequency"
					:items="digestSettingItems"
					size="sm"
					class="w-32"
					:aria-label="`Digest of ${subscription.siteName}`"
					@update:model-value="frequency => choose(subscription.siteId, frequency as DigestSetting)"
				/>
			</li>
		</ul>
		<UEmpty
			v-else
			icon="i-material-symbols-mail-outline-rounded"
			title="No Sites yet"
			description="Add a Site to choose its Digest."
			class="py-8"
		/>
	</UCard>
</template>
