<script setup lang="ts">
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useChat } from "@ai-sdk/vue";
import { getTextFromMessage } from "@nuxt/ui/utils/ai";
import type { AiConversation, AiConversationList, AiConversationWithMessages } from "#layers/core/shared/types/ai";

const props = defineProps<{ siteId?: string; subject: string }>();

const { organization } = useOrganization();
const { user } = useAuth();
const notify = useNotify();
const apiRoot = computed(() => `/api/organizations/${organization.value.id}/ai`);

const { data: list, refresh: refreshList } = useFetch<AiConversationList>(() => `${apiRoot.value}/conversations`, {
	query: computed(() => (props.siteId ? { site: props.siteId } : {})),
	default: () => ({ conversations: [], allowance: { used: 0, limit: null, left: null } }),
	server: false,
});

const conversationId = ref<string | null>(null);
const draft = ref("");
const loadingConversation = ref(false);
const confirmingDelete = ref(false);

const { messages, status, error, sendMessage, stop, clearError } = useChat({
	transport: new DefaultChatTransport({
		api: `${apiRoot.value}/chat`,
		prepareSendMessagesRequest({ messages: outgoing }) {
			const last = outgoing.at(-1);
			return { body: { conversationId: conversationId.value, message: { text: last ? getTextFromMessage(last) : "" } } };
		},
	}),
	onFinish: () => refreshList(),
	onError: caught => notify.error("Ask AI could not answer", null, errorMessage(caught)),
});

const busy = computed(() => status.value === "submitted" || status.value === "streaming");
const outOfQuestions = computed(() => list.value.allowance.left === 0);
const conversationItems = computed(() => list.value.conversations.map((conversation: AiConversation) => ({ label: conversation.title, value: conversation.id })));
const allowanceLabel = computed(() => {
	const { left, limit } = list.value.allowance;
	return limit === null ? "" : `${left} of ${limit} questions left this month`;
});
const starters = computed(() => starterQuestions(props.siteId ? "site" : "organization"));

// The server answers errors as JSON; the stream surfaces them as the raw body.
function errorMessage(caught: Error) {
	try {
		return (JSON.parse(caught.message) as { message?: string }).message || caught.message;
	}
	catch {
		return caught.message;
	}
}

async function openConversation(id: string | null) {
	if (busy.value) {
		stop();
	}
	clearError();
	conversationId.value = id;
	if (!id) {
		messages.value = [];
		return;
	}
	loadingConversation.value = true;
	try {
		const conversation = await $fetch<AiConversationWithMessages>(`${apiRoot.value}/conversations/${id}`);
		messages.value = conversation.messages as UIMessage[];
	}
	catch (caught) {
		notify.error("Could not open the conversation", caught);
	}
	finally {
		loadingConversation.value = false;
	}
}

async function ask(text: string) {
	const question = text.trim();
	if (!question || busy.value || outOfQuestions.value) {
		return;
	}
	if (!conversationId.value) {
		try {
			const created = await $fetch<AiConversation>(`${apiRoot.value}/conversations`, { method: "POST", body: { siteId: props.siteId } });
			conversationId.value = created.id;
		}
		catch (caught) {
			notify.error("Could not start a conversation", caught);
			return;
		}
	}
	draft.value = "";
	await sendMessage({ text: question });
}

async function deleteConversation() {
	const id = conversationId.value;
	if (!id) {
		return;
	}
	try {
		await $fetch(`${apiRoot.value}/conversations/${id}`, { method: "DELETE" });
	}
	catch (caught) {
		notify.error("Could not delete the conversation", caught);
		return;
	}
	confirmingDelete.value = false;
	await openConversation(null);
	await refreshList();
}
</script>

<template>
	<div class="mx-auto flex size-full max-w-3xl flex-col gap-3">
		<div class="flex flex-wrap items-center gap-2">
			<USelect
				:model-value="conversationId ?? undefined"
				:items="conversationItems"
				placeholder="Past conversations"
				:disabled="conversationItems.length === 0"
				class="min-w-0 flex-1 sm:max-w-xs"
				aria-label="Past conversations"
				@update:model-value="openConversation(String($event))"
			/>
			<UButton
				label="New chat"
				icon="i-material-symbols-add-rounded"
				color="neutral"
				variant="outline"
				:disabled="!conversationId"
				@click="openConversation(null)"
			/>
			<UPopover
				v-if="conversationId"
				v-model:open="confirmingDelete"
			>
				<UButton
					icon="i-material-symbols-delete-outline-rounded"
					color="neutral"
					variant="ghost"
					aria-label="Delete this conversation"
				/>
				<template #content>
					<div class="flex flex-col gap-2 p-3 text-sm">
						<p>Delete this conversation?</p>
						<UButton
							label="Delete"
							color="error"
							size="sm"
							@click="deleteConversation"
						/>
					</div>
				</template>
			</UPopover>
			<span
				v-if="allowanceLabel"
				class="ml-auto text-xs text-muted"
			>{{ allowanceLabel }}</span>
		</div>

		<div class="flex min-h-0 flex-1 flex-col">
			<div
				v-if="loadingConversation"
				class="flex flex-col gap-3 py-6"
			>
				<USkeleton class="h-10 w-2/3 self-end" />
				<USkeleton class="h-24 w-full" />
			</div>

			<div
				v-else-if="messages.length === 0"
				class="m-auto flex max-w-lg flex-col items-center gap-4 py-10 text-center"
			>
				<UIcon
					name="i-material-symbols-auto-awesome-outline-rounded"
					class="size-8 text-primary"
				/>
				<div>
					<h2 class="font-semibold text-highlighted">
						Ask about {{ subject }}
					</h2>
					<p class="text-sm text-muted">
						Answers come from your own analytics, with charts where they help.
					</p>
				</div>
				<div class="flex flex-wrap justify-center gap-2">
					<UButton
						v-for="starter in starters"
						:key="starter"
						:label="starter"
						size="sm"
						color="neutral"
						variant="outline"
						:disabled="outOfQuestions"
						@click="ask(starter)"
					/>
				</div>
			</div>

			<UChatMessages
				v-else
				:messages="messages"
				:status="status"
				:assistant="{ avatar: { icon: 'i-material-symbols-auto-awesome-outline-rounded' }, variant: 'naked' }"
				:user="{ avatar: { src: user?.image ?? undefined, alt: user?.name } }"
				should-auto-scroll
				class="flex-1"
			>
				<template #content="{ message }">
					<AiMessageParts :message="message" />
				</template>
			</UChatMessages>
		</div>

		<UAlert
			v-if="outOfQuestions"
			color="warning"
			variant="subtle"
			icon="i-material-symbols-hourglass-empty-rounded"
			:title="aiQuestionLimitMessage(list.allowance.limit ?? 0)"
		/>
		<UChatPrompt
			v-else
			v-model="draft"
			:error="error"
			placeholder="Ask a question in plain English…"
			class="sticky bottom-0"
			@submit="ask(draft)"
		>
			<UChatPromptSubmit
				:status="status"
				@stop="stop()"
			/>
		</UChatPrompt>
	</div>
</template>
