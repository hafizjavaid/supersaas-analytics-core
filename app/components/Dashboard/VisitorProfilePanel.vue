<script setup lang="ts">
import type { VisitorProfile } from "#layers/core/shared/types/analytics";
import { CHANNEL_LABELS, isChannel } from "#layers/core/shared/utils/channels";
import { countryName } from "#layers/core/shared/utils/countries";

const props = defineProps<{ api: string; visitorId: string; timezone: string }>();
const open = defineModel<boolean>("open", { default: false });

const { data: profile, status } = useSiteReport<VisitorProfile>(`visitors/${props.visitorId}`, () => props.api, {});

const selectedVisits = ref<Record<string, string | null>>({});

const totalTiles = computed(() => {
	const totals = profile.value?.totals;
	return [
		...(profile.value?.identified ? [{ label: "Days", value: totals?.days ?? 0 }] : []),
		{ label: "Visits", value: totals?.visits ?? 0 },
		{ label: "Pageviews", value: totals?.pageviews ?? 0 },
		{ label: "Events", value: totals?.events ?? 0 },
		{ label: "Time", value: formatDuration(totals?.durationSeconds ?? 0) },
	];
});

const firstSourceLabel = computed(() => {
	const source = profile.value?.firstVisit?.source ?? null;
	const channel = source && isChannel(source.channel) ? ` (${CHANNEL_LABELS[source.channel]})` : "";
	return `${sourceLabel(source)}${channel}`;
});
</script>

<template>
	<USlideover
		v-model:open="open"
		:title="profile?.label ?? 'Visitor'"
		:description="profile?.identified ? 'Identified visitor: journeys from every day it was identified' : 'Anonymous visitor: one day of activity'"
		:ui="{ content: 'sm:max-w-xl' }"
	>
		<template #body>
			<p
				v-if="status === 'error'"
				class="text-sm text-muted"
			>
				Could not load this Visitor.
			</p>

			<div
				v-else-if="!profile"
				class="grid gap-2"
			>
				<USkeleton
					v-for="index in 5"
					:key="index"
					class="h-8 w-full"
				/>
			</div>

			<div
				v-else
				class="grid gap-6"
			>
				<section class="grid gap-3">
					<dl class="grid grid-cols-2 gap-1 sm:grid-cols-5">
						<div
							v-for="tile in totalTiles"
							:key="tile.label"
							class="rounded-md bg-elevated/50 px-3 py-2"
						>
							<dt class="text-xs text-muted">
								{{ tile.label }}
							</dt>
							<dd class="mt-0.5 text-lg font-semibold tabular-nums text-highlighted">
								{{ tile.value }}
							</dd>
						</div>
					</dl>
					<p
						v-if="profile.firstVisit"
						class="flex flex-wrap items-center gap-1.5 text-sm text-muted"
					>
						First visit {{ formatDay(profile.firstVisit.startedAt, timezone) }}, {{ formatClock(profile.firstVisit.startedAt, timezone) }} from
						<DashboardSourceIcon
							:domain="profile.firstVisit.source?.referrerDomain ?? ''"
							class="size-4"
						/>
						<span class="font-medium text-highlighted">{{ firstSourceLabel }}</span>
					</p>
				</section>

				<section
					v-for="journey in profile.journeys"
					:key="journey.visitorId"
					class="grid gap-3"
				>
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<h3 class="font-semibold text-highlighted">
							{{ formatDay(journey.firstSeen, timezone) }}
						</h3>
						<span
							v-if="journey.location"
							class="flex items-center gap-1.5 text-muted"
						>
							<DashboardCountryFlag
								:country="journey.location.country"
								class="size-4"
							/>
							{{ journey.location.city ? `${journey.location.city}, ` : "" }}{{ countryName(journey.location.country) }}
						</span>
						<span
							v-if="journey.device"
							class="text-muted"
						>· {{ journey.device.browser }} on {{ journey.device.os }}</span>
					</div>

					<div
						class="flex flex-wrap gap-1"
						role="group"
						aria-label="Visits"
					>
						<UButton
							label="All visits"
							size="xs"
							color="neutral"
							:variant="selectedVisits[journey.visitorId] ? 'ghost' : 'soft'"
							:aria-pressed="!selectedVisits[journey.visitorId]"
							@click="selectedVisits[journey.visitorId] = null"
						/>
						<UButton
							v-for="visit in journey.visits"
							:key="visit.id"
							:label="`${formatClock(visit.startedAt, timezone)} · ${visit.pageviews} ${visit.pageviews === 1 ? 'page' : 'pages'}`"
							:title="`From ${sourceLabel(visit.source)}, ${formatDuration(visit.endedAt - visit.startedAt)}`"
							size="xs"
							color="neutral"
							:variant="selectedVisits[journey.visitorId] === visit.id ? 'soft' : 'outline'"
							:aria-pressed="selectedVisits[journey.visitorId] === visit.id"
							@click="selectedVisits[journey.visitorId] = visit.id"
						/>
					</div>

					<DashboardJourneySteps
						:steps="stepsOfVisit(journey.steps, selectedVisits[journey.visitorId] ?? null)"
						:timezone="timezone"
					/>
				</section>
			</div>
		</template>
	</USlideover>
</template>
