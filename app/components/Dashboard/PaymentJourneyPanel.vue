<script setup lang="ts">
import type { PaymentJourney } from "#layers/core/shared/types/revenue";
import { countryName } from "#layers/core/shared/utils/countries";

const props = defineProps<{ api: string; paymentId: string; email: string | null; timezone: string }>();
const open = defineModel<boolean>("open", { default: false });

const { data: journey, status } = useSiteReport<PaymentJourney>(`payments/${props.paymentId}`, () => props.api, {});

const tiles = computed(() => {
	const payment = journey.value?.payment;
	return [
		{ label: "Time to convert", value: formatTimeToConvert(payment?.timeToConvertSeconds ?? null) },
		{ label: "Sessions", value: payment?.visits ?? 0 },
		{ label: "Pages", value: journey.value?.pageviews ?? 0 },
		{ label: "Events", value: journey.value?.events ?? 0 },
	];
});

// Oldest day first, each cut at the Payment, so the timeline reads up to it.
const days = computed(() => {
	const paidAt = journey.value?.payment.paidAt ?? 0;
	return [...journey.value?.profile.journeys ?? []]
		.reverse()
		.map(day => ({ ...day, steps: day.steps.filter(step => step.timestamp <= paidAt) }))
		.filter(day => day.steps.length > 0 || day.visitorId === journey.value?.payment.visitorId);
});
</script>

<template>
	<USlideover
		v-model:open="open"
		:title="email ?? 'Journey for payment'"
		:description="journey ? paymentHeadline(journey.payment) : undefined"
		:ui="{ content: 'sm:max-w-xl' }"
	>
		<template #body>
			<p
				v-if="status === 'error'"
				class="text-sm text-muted"
			>
				Could not load this Payment.
			</p>

			<div
				v-else-if="!journey"
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
				<dl class="grid grid-cols-2 gap-1 sm:grid-cols-4">
					<div
						v-for="tile in tiles"
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

				<section
					v-for="day in days"
					:key="day.visitorId"
					class="grid gap-3"
				>
					<div class="flex flex-wrap items-center gap-2 text-sm">
						<h3 class="font-semibold text-highlighted">
							{{ formatDay(day.firstSeen, timezone) }}
						</h3>
						<span
							v-if="day.location"
							class="flex items-center gap-1.5 text-muted"
						>
							<DashboardCountryFlag
								:country="day.location.country"
								class="size-4"
							/>
							{{ day.location.city ? `${day.location.city}, ` : "" }}{{ countryName(day.location.country) }}
						</span>
						<span
							v-if="day.device"
							class="text-muted"
						>· {{ day.device.browser }} on {{ day.device.os }}</span>
					</div>

					<DashboardJourneySteps
						:steps="day.steps"
						:timezone="timezone"
					>
						<li
							v-if="day.visitorId === journey.payment.visitorId"
							class="relative flex items-start gap-3 py-1.5 text-sm"
						>
							<UIcon
								name="i-material-symbols-check-circle-rounded"
								class="absolute top-2 -left-6 size-4 rounded-full bg-default text-success"
							/>
							<span class="w-11 shrink-0 font-mono text-xs/5 text-muted tabular-nums">{{ formatClock(journey.payment.paidAt, timezone) }}</span>
							<p class="flex-1">
								<span class="font-medium text-success">Payment completed</span>
								<span class="ml-1.5 font-semibold text-highlighted tabular-nums">{{ formatMoney(journey.payment.amount, journey.payment.currency) }}</span>
							</p>
						</li>
					</DashboardJourneySteps>
				</section>
			</div>
		</template>
	</USlideover>
</template>
