<script setup lang="ts">
import type { Confirmation } from "#layers/core/app/components/App/ConfirmModal.vue";
import type { ShareLink } from "#layers/core/shared/types/analytics";
import { MIN_SHARE_PASSWORD_LENGTH } from "#layers/core/shared/schemas/share-links";

const props = defineProps<{ siteId: string }>();

const notify = useNotify();
const origin = useRequestURL().origin;
const { copy, copied, text: copiedText } = useClipboard({ copiedDuring: 2000 });
const { data: links, refresh } = await useFetch<ShareLink[]>(() => `/api/sites/${props.siteId}/share-links`, { key: `share-links:${props.siteId}`, default: () => [] });

const name = ref("");
const password = ref("");
const protect = ref(false);
const pending = ref(false);
const confirmation = ref<Confirmation | null>(null);

const passwordError = computed(() => protect.value && password.value.length > 0 && password.value.length < MIN_SHARE_PASSWORD_LENGTH
	? `Use at least ${MIN_SHARE_PASSWORD_LENGTH} characters`
	: undefined);
const canCreate = computed(() => !!name.value.trim() && (!protect.value || password.value.length >= MIN_SHARE_PASSWORD_LENGTH));

function shareUrl(link: ShareLink) {
	return `${origin}/share/${link.token}`;
}

async function create() {
	pending.value = true;
	try {
		const link = await $fetch<ShareLink>(`/api/sites/${props.siteId}/share-links`, {
			method: "POST",
			body: { name: name.value, password: protect.value ? password.value : undefined },
		});
		notify.success(`Created ${link.name}`, "Copy the link and send it to whoever should see the dashboard.");
		name.value = "";
		password.value = "";
		protect.value = false;
		await refresh();
	}
	catch (caught) {
		notify.error("Could not create the Share link", caught);
	}
	finally {
		pending.value = false;
	}
}

function revoke(link: ShareLink) {
	confirmation.value = {
		title: `Revoke ${link.name}?`,
		description: "Anyone with this link loses access at once. This cannot be undone.",
		confirmLabel: "Revoke",
		run: async () => {
			try {
				await $fetch(`/api/sites/${props.siteId}/share-links/${link.id}`, { method: "DELETE" });
			}
			catch (caught) {
				notify.error("Could not revoke the Share link", caught);
				return false;
			}
			notify.success(`Revoked ${link.name}`);
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
				Share links
			</h2>
			<p class="text-sm text-muted">
				Anyone with a Share link sees this Site's dashboard, Pages and Funnels, read-only and without signing in.
				They never see individual Visitors or settings. Links with a destination share only that Outbound link's
				clicks; create them from the Links page.
			</p>
		</template>

		<div class="flex flex-col gap-6">
			<form
				aria-labelledby="new-share-link"
				class="flex flex-col gap-3"
				@submit.prevent="create"
			>
				<h3
					id="new-share-link"
					class="text-sm font-medium text-highlighted"
				>
					New Share link
				</h3>
				<div class="flex flex-col gap-3 sm:flex-row sm:items-start">
					<UFormField
						label="Name"
						help="Only you and your team see it, for example who the link is for."
						class="flex-1"
					>
						<UInput
							v-model="name"
							placeholder="Investors"
							class="w-full"
							autocomplete="off"
							maxlength="100"
						/>
					</UFormField>
					<UFormField
						v-if="protect"
						label="Password"
						:error="passwordError"
						class="flex-1"
					>
						<UInput
							v-model="password"
							type="password"
							class="w-full"
							autocomplete="new-password"
						/>
					</UFormField>
				</div>
				<div class="flex flex-wrap items-center justify-between gap-3">
					<USwitch
						v-model="protect"
						label="Require a password"
					/>
					<UButton
						type="submit"
						label="Create link"
						icon="i-material-symbols-add-link-rounded"
						:loading="pending"
						:disabled="!canCreate"
					/>
				</div>
			</form>

			<ul
				v-if="links.length"
				class="divide-y divide-default rounded-md border border-default"
				aria-label="Share links"
			>
				<li
					v-for="link in links"
					:key="link.id"
					class="flex items-center gap-2 px-3 py-2"
				>
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="flex items-center gap-1.5 text-sm text-highlighted">
							<span class="truncate">{{ link.name }}</span>
							<UIcon
								v-if="link.hasPassword"
								name="i-material-symbols-lock-outline"
								class="size-4 shrink-0 text-muted"
								aria-label="Password protected"
							/>
							<UBadge
								v-if="link.outboundUrl"
								color="neutral"
								variant="subtle"
								size="sm"
								icon="i-material-symbols-link-rounded"
								:label="outboundLinkLabel(link.outboundUrl)"
								:title="`Shares only the clicks on ${link.outboundUrl}`"
								class="min-w-0 truncate"
							/>
						</span>
						<span class="truncate font-mono text-xs text-muted">{{ shareUrl(link) }}</span>
					</div>
					<UButton
						:icon="copied && copiedText === shareUrl(link) ? 'i-material-symbols-check-rounded' : 'i-material-symbols-content-copy-outline-rounded'"
						color="neutral"
						variant="ghost"
						size="sm"
						:aria-label="`Copy the link for ${link.name}`"
						@click="copy(shareUrl(link))"
					/>
					<UButton
						icon="i-material-symbols-open-in-new-rounded"
						color="neutral"
						variant="ghost"
						size="sm"
						:to="shareUrl(link)"
						target="_blank"
						:aria-label="`Open ${link.name}`"
					/>
					<UButton
						label="Revoke"
						color="error"
						variant="ghost"
						size="sm"
						@click="revoke(link)"
					/>
				</li>
			</ul>
			<p
				v-else
				class="text-sm text-muted"
			>
				No Share links yet.
			</p>
		</div>

		<AppConfirmModal v-model="confirmation" />
	</UCard>
</template>
