<script setup lang="ts">
import type { Confirmation } from "#layers/core/app/components/App/ConfirmModal.vue";
import type { RevenueConnection } from "#layers/core/shared/types/revenue";
import type { RevenueCurrency, RevenueEnvironment, RevenueProviderId } from "#layers/core/shared/utils/revenue";
import { isRevenueCurrency, REVENUE_CURRENCIES, REVENUE_PROVIDERS } from "#layers/core/shared/utils/revenue";

const props = defineProps<{ siteId: string; editable: boolean }>();

const notify = useNotify();
const { copy, copied, text: copiedText } = useClipboard({ copiedDuring: 2000 });
const { data, refresh } = await useFetch<{ connection: RevenueConnection | null }>(() => `/api/sites/${props.siteId}/revenue`, {
	key: `revenue:${props.siteId}`,
	immediate: props.editable,
	default: () => ({ connection: null }),
});
const connection = computed(() => data.value.connection);

const editing = ref(false);
const provider = ref<RevenueProviderId>("polar");
const chosenEnvironment = ref<RevenueEnvironment>("production");
const accessToken = ref("");
const webhookSecret = ref("");
const savingSecret = ref(false);
const currency = ref<RevenueCurrency>("usd");
const pending = ref(false);
const confirmation = ref<Confirmation | null>(null);

const providers = REVENUE_PROVIDERS.map(id => ({ label: revenueProviderGuides[id].name, value: id }));
const guide = computed(() => revenueProviderGuides[provider.value]);
const connectedGuide = computed(() => connection.value && revenueProviderGuides[connection.value.provider]);
const environments = computed(() => Object.entries(guide.value.environmentLabels).map(([value, label]) => ({ label, value })));
const environment = computed(() => guide.value.environmentOfToken?.(accessToken.value.trim()) ?? chosenEnvironment.value);
const currencies = REVENUE_CURRENCIES.map(code => ({ label: code.toUpperCase(), value: code }));
const showForm = computed(() => !connection.value || editing.value);
const webhookFields = computed(() => {
	const shown = connection.value;
	if (!shown) {
		return [];
	}
	return [
		{ label: "URL", value: shown.webhookUrl },
		...(shown.webhookSecret === null ? [] : [{ label: "Secret", value: shown.webhookSecret }]),
	];
});

function edit() {
	provider.value = connection.value?.provider ?? "polar";
	chosenEnvironment.value = connection.value?.environment ?? "production";
	const connectedCurrency = connection.value?.currency ?? "usd";
	currency.value = isRevenueCurrency(connectedCurrency) ? connectedCurrency : "usd";
	accessToken.value = "";
	editing.value = true;
}

async function save() {
	pending.value = true;
	try {
		await $fetch(`/api/sites/${props.siteId}/revenue`, {
			method: "PUT",
			body: { provider: provider.value, environment: environment.value, accessToken: accessToken.value, currency: currency.value },
		});
		notify.success(`${guide.value.name} connected`, `Add the webhook in ${guide.value.name} so Payments start arriving.`);
		accessToken.value = "";
		editing.value = false;
		await refresh();
	}
	catch (caught) {
		notify.error(`Could not connect ${guide.value.name}`, caught);
	}
	finally {
		pending.value = false;
	}
}

async function saveWebhookSecret() {
	savingSecret.value = true;
	try {
		await $fetch(`/api/sites/${props.siteId}/revenue`, { method: "PATCH", body: { webhookSecret: webhookSecret.value } });
		notify.success("Signing secret saved", "Payments arrive from the next checkout.");
		webhookSecret.value = "";
		await refresh();
	}
	catch (caught) {
		notify.error("Could not save the signing secret", caught);
	}
	finally {
		savingSecret.value = false;
	}
}

function disconnect() {
	const name = connectedGuide.value?.name;
	confirmation.value = {
		title: `Disconnect ${name}?`,
		description: "New Payments stop arriving and Revenue is hidden from the dashboard. Payments already recorded are kept.",
		confirmLabel: "Disconnect",
		run: async () => {
			try {
				await $fetch(`/api/sites/${props.siteId}/revenue`, { method: "DELETE" });
			}
			catch (caught) {
				notify.error(`Could not disconnect ${name}`, caught);
				return false;
			}
			notify.success(`${name} disconnected`);
			await refresh();
			return true;
		},
	};
}
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Revenue attribution
			</h2>
			<p class="text-sm text-muted">
				Connect Polar or Stripe so each Payment is attributed to the Visitor who made it. Customer emails are fetched
				from the provider when you view them and never stored.
			</p>
		</template>

		<p
			v-if="!editable"
			class="text-sm text-muted"
		>
			An Owner or Admin of this Organization can connect a Revenue provider.
		</p>

		<div
			v-else
			class="flex flex-col gap-6"
		>
			<div
				v-if="connection && connectedGuide && !editing"
				class="flex flex-wrap items-center gap-3"
			>
				<UIcon
					name="i-material-symbols-payments-outline-rounded"
					class="size-6"
				/>
				<div class="flex min-w-0 flex-1 flex-col">
					<span class="flex items-center gap-2 text-sm font-medium text-highlighted">
						{{ connectedGuide.name }}
						<UBadge
							v-if="connection.environment === 'sandbox'"
							:label="connectedGuide.environmentLabels.sandbox"
							color="warning"
							variant="subtle"
							size="sm"
						/>
					</span>
					<span class="text-xs text-muted">
						Token {{ connection.tokenHint }} · Revenue in {{ connection.currency.toUpperCase() }} ·
						{{ connection.lastPaymentAt ? `last Payment ${new Date(connection.lastPaymentAt * 1000).toLocaleString()}` : "no Payments yet" }}
					</span>
				</div>
				<UButton
					label="Change"
					color="neutral"
					variant="outline"
					size="sm"
					@click="edit"
				/>
				<UButton
					label="Disconnect"
					color="error"
					variant="ghost"
					size="sm"
					@click="disconnect"
				/>
			</div>

			<form
				v-if="showForm"
				aria-labelledby="connect-provider"
				class="flex flex-col gap-3"
				@submit.prevent="save"
			>
				<h3
					id="connect-provider"
					class="text-sm font-medium text-highlighted"
				>
					{{ connection ? "Change the Revenue connection" : "Connect a Revenue provider" }}
				</h3>
				<URadioGroup
					v-model="provider"
					:items="providers"
					orientation="horizontal"
					legend="Provider"
				/>
				<URadioGroup
					v-if="!guide.environmentOfToken"
					v-model="chosenEnvironment"
					:items="environments"
					orientation="horizontal"
					:legend="`${guide.name} environment`"
				/>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
					<UFormField
						:label="guide.tokenLabel"
						:help="guide.tokenHelp"
						class="flex-1"
					>
						<UInput
							v-model="accessToken"
							type="password"
							:placeholder="guide.tokenPlaceholder"
							class="w-full font-mono"
							autocomplete="off"
						/>
					</UFormField>
					<UFormField
						label="Currency"
						help="Revenue sums Payments in this currency."
					>
						<USelect
							v-model="currency"
							:items="currencies"
							class="w-28"
						/>
					</UFormField>
				</div>
				<div class="flex justify-end gap-2">
					<UButton
						v-if="editing"
						label="Cancel"
						color="neutral"
						variant="ghost"
						@click="editing = false"
					/>
					<UButton
						type="submit"
						:label="connection ? 'Save' : `Connect ${guide.name}`"
						:loading="pending"
						:disabled="!accessToken.trim()"
					/>
				</div>
			</form>

			<section
				v-if="connection && connectedGuide"
				aria-labelledby="provider-webhook"
				class="flex flex-col gap-3"
			>
				<h3
					id="provider-webhook"
					class="text-sm font-medium text-highlighted"
				>
					1. Add the webhook in {{ connectedGuide.name }}
				</h3>
				<p class="text-sm text-muted">
					{{ connectedGuide.webhookSteps }}
					<template
						v-for="(name, at) in connectedGuide.webhookEvents"
						:key="name"
					>
						<code class="font-mono">{{ name }}</code>{{ at < connectedGuide.webhookEvents.length - 1 ? ", " : "." }}
					</template>
				</p>
				<div
					v-for="field in webhookFields"
					:key="field.label"
					class="flex items-center gap-2 rounded-md bg-elevated p-2 pl-3"
				>
					<span class="w-12 shrink-0 text-xs text-muted">{{ field.label }}</span>
					<code class="min-w-0 flex-1 truncate font-mono text-sm">{{ field.value }}</code>
					<UButton
						:icon="copied && copiedText === field.value ? 'i-material-symbols-check-rounded' : 'i-material-symbols-content-copy-outline-rounded'"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="`Copy the webhook ${field.label.toLowerCase()}`"
						@click="copy(field.value)"
					/>
				</div>
				<form
					v-if="connection.webhookSecret === null"
					class="flex flex-col gap-2 sm:flex-row sm:items-end"
					@submit.prevent="saveWebhookSecret"
				>
					<UFormField
						label="Signing secret"
						:help="connection.webhookSecretHint ? `Saved: ${connection.webhookSecretHint}. Paste a new one after rolling it in ${connectedGuide.name}.` : 'Payments are refused until it is saved.'"
						class="flex-1"
					>
						<UInput
							v-model="webhookSecret"
							type="password"
							placeholder="whsec_…"
							class="w-full font-mono"
							autocomplete="off"
						/>
					</UFormField>
					<UButton
						type="submit"
						label="Save secret"
						:loading="savingSecret"
						:disabled="!webhookSecret.trim()"
					/>
				</form>

				<h3 class="mt-3 text-sm font-medium text-highlighted">
					2. Pass the Visitor id to the checkout
				</h3>
				<p class="text-sm text-muted">
					{{ connectedGuide.checkoutSteps }}
				</p>
				<pre class="overflow-x-auto rounded-md bg-elevated p-3 font-mono text-sm">{{ connectedGuide.checkoutSnippet }}</pre>
			</section>
		</div>

		<AppConfirmModal v-model="confirmation" />
	</UCard>
</template>
