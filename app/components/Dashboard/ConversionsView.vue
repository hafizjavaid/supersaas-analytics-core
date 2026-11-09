<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { ConversionsReport, PaymentCustomers, PaymentRow } from "#layers/core/shared/types/revenue";
import { countryName } from "#layers/core/shared/utils/countries";
import type { Filter } from "#layers/core/shared/utils/filters";

const props = defineProps<{ api: string; timezone: string; settingsPath: string; canConnect: boolean }>();

const { reportQuery } = useDashboardQuery();
const { data: report, pending } = useSiteReport<ConversionsReport>("conversions", () => props.api, reportQuery);

const paymentIds = computed(() => (report.value?.rows ?? []).map(row => row.id));
const { data: customers } = useFetch<PaymentCustomers>(() => `${props.api}/payments/customers`, {
	query: computed(() => ({ payment: paymentIds.value })),
	lazy: true,
	server: false,
});

const selectedPayment = ref<PaymentRow | null>(null);
const journeyOpen = computed({
	get: () => selectedPayment.value !== null,
	set: (open) => {
		if (!open) {
			selectedPayment.value = null;
		}
	},
});

const currency = computed(() => report.value?.currency ?? "usd");
const money = (amount: number) => formatMoney(amount, currency.value);

const summaryTiles = computed(() => {
	const summary = report.value?.summary;
	const previous = summary?.previous;
	const change = (current: number | null | undefined, before: number | null | undefined, higherIsBetter = true) =>
		current === null || current === undefined || before === null || before === undefined ? null : valueChange(current, before, higherIsBetter);
	return [
		{ label: "Revenue", value: money(summary?.revenue ?? 0), change: change(summary?.revenue, previous?.revenue) },
		{ label: "Payments", value: formatCompactNumber(summary?.payments ?? 0), change: change(summary?.payments, previous?.payments) },
		{ label: "Avg. order value", value: money(summary?.avgOrderValue ?? 0), change: change(summary?.avgOrderValue, previous?.avgOrderValue) },
		{
			label: "Avg. time to convert",
			value: formatTimeToConvert(summary?.avgTimeToConvertSeconds ?? null),
			title: "From the payer's first visit to the Payment",
			change: change(summary?.avgTimeToConvertSeconds, previous?.avgTimeToConvertSeconds, false),
		},
	];
});

const sourceItems = computed(() => (report.value?.sources ?? []).map(row => ({
	key: row.value,
	label: row.value,
	referrerDomain: row.referrerDomain,
	value: row.revenue,
	filters: row.referrerDomain === "(direct)" ? undefined : [{ dimension: "referrer", value: row.referrerDomain } satisfies Filter],
})));
const countryItems = computed(() => (report.value?.countries ?? []).map(row => ({
	key: row.value,
	label: row.value === "Unknown" ? "Unknown" : countryName(row.value),
	country: row.value,
	value: row.revenue,
	filters: row.value === "Unknown" ? undefined : [{ dimension: "country", value: row.value } satisfies Filter],
})));

const hourly = computed(() => {
	const resolved = report.value?.range;
	return !!resolved && (!!resolved.hours || resolved.fromDate === resolved.toDate);
});

const MAX_JOURNEY_DOTS = 6;

const columns: TableColumn<PaymentRow>[] = [
	{ id: "customer", header: "Customer" },
	{ id: "country", header: "Country", meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell" } } },
	{ id: "source", header: "Source", meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } } },
	{ id: "amount", header: () => h("div", { class: "text-right" }, "Spent"), meta: { class: { td: "text-right tabular-nums" } } },
	{ id: "convert", header: () => h("div", { class: "text-right" }, "Time to convert"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	{ id: "paid", header: "Completed", meta: { class: { th: "hidden lg:table-cell", td: "hidden lg:table-cell" } } },
	{ id: "journey", header: "Journey", meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell" } } },
];

function customerEmail(payment: PaymentRow) {
	return customers.value?.emails[payment.id] ?? null;
}
</script>

<template>
	<div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
		<DashboardFilterBar />

		<UEmpty
			v-if="report && !report.currency && report.total === 0"
			icon="i-material-symbols-payments-outline-rounded"
			title="No Revenue provider yet"
			:description="canConnect ? 'Connect Polar or Stripe so each Payment is attributed to the Visitor who made it.' : 'An Owner or Admin can connect a Revenue provider in the Site settings.'"
			:actions="canConnect ? [{ label: 'Connect a provider', icon: 'i-material-symbols-link-rounded', to: `${settingsPath}/attribution` }] : []"
			class="m-auto max-w-sm py-12"
		/>

		<template v-else>
			<UCard :ui="{ body: 'p-2.5 sm:p-2.5' }">
				<dl class="grid grid-cols-2 gap-1 sm:grid-cols-4">
					<div
						v-for="tile in summaryTiles"
						:key="tile.label"
						class="rounded-md px-3 py-2"
						:title="tile.title"
					>
						<dt class="text-sm text-muted">
							{{ tile.label }}
						</dt>
						<dd class="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
							<span class="text-2xl font-semibold tabular-nums text-highlighted">{{ tile.value }}</span>
							<span
								v-if="tile.change"
								class="rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums"
								:class="CHANGE_PILL_CLASSES[tile.change.tone]"
							>{{ tile.change.label }}</span>
						</dd>
					</div>
				</dl>
				<USkeleton
					v-if="pending && !report"
					class="mt-3 h-[220px] w-full"
				/>
				<DashboardRevenueChart
					v-else-if="report?.currency"
					class="mt-3"
					:points="report.points"
					:currency="report.currency"
					:hourly="hourly"
				/>
			</UCard>

			<div class="grid gap-4 md:grid-cols-2">
				<UCard :ui="{ header: 'px-4 py-3 sm:px-4 text-sm font-medium', body: 'p-2.5 sm:p-2.5' }">
					<template #header>
						Revenue by Source
					</template>
					<DashboardRankedList
						:items="sourceItems"
						:format="money"
						empty-label="No Payments in this Range"
					>
						<template #icon="{ item }">
							<DashboardSourceIcon :domain="item.referrerDomain" />
						</template>
					</DashboardRankedList>
				</UCard>
				<UCard :ui="{ header: 'px-4 py-3 sm:px-4 text-sm font-medium', body: 'p-2.5 sm:p-2.5' }">
					<template #header>
						Revenue by country
					</template>
					<DashboardRankedList
						:items="countryItems"
						:format="money"
						empty-label="No Payments in this Range"
					>
						<template #icon="{ item }">
							<DashboardCountryFlag :country="item.country" />
						</template>
					</DashboardRankedList>
				</UCard>
			</div>

			<UCard :ui="{ header: 'px-4 py-3 sm:px-4 text-sm font-medium', body: 'p-0 sm:p-0' }">
				<template #header>
					Customers
				</template>
				<UTable
					:data="report?.rows ?? []"
					:columns="columns"
					:loading="pending && !report"
					empty="No Payments in this Range"
					:ui="{ th: 'py-2', td: 'py-2' }"
				>
					<template #customer-cell="{ row }">
						<button
							type="button"
							class="flex items-center gap-2 rounded text-left whitespace-nowrap focus-visible:outline-2 focus-visible:outline-primary"
							title="Open the journey to this Payment"
							@click="selectedPayment = row.original"
						>
							<UAvatar
								icon="i-material-symbols-person-outline-rounded"
								size="sm"
							/>
							<span
								class="font-medium text-highlighted"
								:title="customers?.masked ? 'Only Owners and Admins see full emails' : undefined"
							>{{ customerEmail(row.original) ?? "Customer" }}</span>
							<UBadge
								label="Customer"
								color="success"
								variant="subtle"
								size="sm"
							/>
						</button>
					</template>
					<template #country-cell="{ row }">
						<span
							v-if="row.original.location"
							class="flex items-center gap-2 whitespace-nowrap"
						>
							<DashboardCountryFlag :country="row.original.location.country" />
							{{ countryName(row.original.location.country) }}
						</span>
						<span v-else>–</span>
					</template>
					<template #source-cell="{ row }">
						<span class="flex items-center gap-2 whitespace-nowrap">
							<DashboardSourceIcon :domain="row.original.source?.referrerDomain ?? ''" />
							{{ sourceLabel(row.original.source) }}
						</span>
					</template>
					<template #amount-cell="{ row }">
						{{ formatMoney(row.original.amount, row.original.currency) }}
					</template>
					<template #convert-cell="{ row }">
						{{ formatTimeToConvert(row.original.timeToConvertSeconds) }}
					</template>
					<template #paid-cell="{ row }">
						<span class="whitespace-nowrap text-muted">{{ formatDay(row.original.paidAt, timezone) }}, {{ formatClock(row.original.paidAt, timezone) }}</span>
					</template>
					<template #journey-cell="{ row }">
						<span
							class="flex items-center gap-1"
							:title="`${row.original.visits} ${row.original.visits === 1 ? 'Visit' : 'Visits'} before paying`"
						>
							<span
								v-for="dot in Math.min(row.original.visits, MAX_JOURNEY_DOTS)"
								:key="dot"
								class="size-2 rounded-full bg-primary/60"
							/>
							<span class="size-2 rounded-full bg-success" />
							<span
								v-if="row.original.visits > MAX_JOURNEY_DOTS"
								class="text-xs text-muted"
							>+{{ row.original.visits - MAX_JOURNEY_DOTS }}</span>
						</span>
					</template>
				</UTable>

				<template
					v-if="report && report.total > report.rows.length"
					#footer
				>
					<p class="text-sm text-muted">
						Showing the {{ report.rows.length }} newest of {{ report.total }} Payments
					</p>
				</template>
			</UCard>
		</template>

		<DashboardPaymentJourneyPanel
			v-if="selectedPayment"
			v-model:open="journeyOpen"
			:api="api"
			:payment-id="selectedPayment.id"
			:email="customerEmail(selectedPayment)"
			:timezone="timezone"
		/>
	</div>
</template>
