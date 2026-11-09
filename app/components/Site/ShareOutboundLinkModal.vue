<script setup lang="ts">
import type { ShareLink } from "#layers/core/shared/types/analytics";
import { MIN_SHARE_PASSWORD_LENGTH } from "#layers/core/shared/schemas/share-links";

const props = defineProps<{ siteId: string; url: string }>();
const open = defineModel<boolean>("open", { default: false });

const notify = useNotify();
const origin = useRequestURL().origin;
const { copy, copied } = useClipboard({ copiedDuring: 2000 });

const name = ref("");
const password = ref("");
const protect = ref(false);
const pending = ref(false);
const created = ref<ShareLink | null>(null);

watch([open, () => props.url], ([isOpen]) => {
	if (isOpen) {
		name.value = outboundLinkHost(props.url);
		password.value = "";
		protect.value = false;
		created.value = null;
	}
}, { immediate: true });

const passwordError = computed(() => protect.value && password.value.length > 0 && password.value.length < MIN_SHARE_PASSWORD_LENGTH
	? `Use at least ${MIN_SHARE_PASSWORD_LENGTH} characters`
	: undefined);
const canCreate = computed(() => !!name.value.trim() && (!protect.value || password.value.length >= MIN_SHARE_PASSWORD_LENGTH));
const shareUrl = computed(() => (created.value ? `${origin}/share/${created.value.token}` : ""));

async function create() {
	pending.value = true;
	try {
		created.value = await $fetch<ShareLink>(`/api/sites/${props.siteId}/share-links`, {
			method: "POST",
			body: { name: name.value, password: protect.value ? password.value : undefined, outboundUrl: props.url },
		});
	}
	catch (caught) {
		notify.error("Could not create the Share link", caught);
	}
	finally {
		pending.value = false;
	}
}
</script>

<template>
	<UModal
		v-model:open="open"
		title="Share this link's stats"
		:description="`Anyone with the Share link sees the clicks on ${outboundLinkLabel(url)}, and nothing else of this Site.`"
	>
		<template #body>
			<div
				v-if="created"
				class="grid gap-2"
			>
				<p class="text-sm text-muted">
					Send this link to whoever should see the stats. You can revoke it in Site Settings → Sharing.
				</p>
				<UFieldGroup class="w-full">
					<UInput
						:model-value="shareUrl"
						readonly
						class="flex-1 font-mono"
						aria-label="Share link"
					/>
					<UButton
						:icon="copied ? 'i-material-symbols-check-rounded' : 'i-material-symbols-content-copy-outline-rounded'"
						color="neutral"
						variant="outline"
						aria-label="Copy the Share link"
						@click="copy(shareUrl)"
					/>
				</UFieldGroup>
			</div>
			<form
				v-else
				id="share-outbound-link-form"
				class="grid gap-4"
				@submit.prevent="create"
			>
				<UFormField
					label="Name"
					help="Only you and the other Members see it, for example the sponsor's name."
				>
					<UInput
						v-model="name"
						class="w-full"
						autocomplete="off"
						maxlength="100"
					/>
				</UFormField>
				<USwitch
					v-model="protect"
					label="Require a password"
				/>
				<UFormField
					v-if="protect"
					label="Password"
					:error="passwordError"
				>
					<UInput
						v-model="password"
						type="password"
						class="w-full"
						autocomplete="new-password"
					/>
				</UFormField>
			</form>
		</template>
		<template #footer="{ close }">
			<div class="flex w-full justify-end gap-2">
				<UButton
					:label="created ? 'Done' : 'Cancel'"
					color="neutral"
					variant="outline"
					@click="close"
				/>
				<UButton
					v-if="!created"
					type="submit"
					form="share-outbound-link-form"
					label="Create Share link"
					icon="i-material-symbols-add-link-rounded"
					:loading="pending"
					:disabled="!canCreate"
				/>
			</div>
		</template>
	</UModal>
</template>
