<script setup lang="ts">
import type { DropdownMenuItem } from "@nuxt/ui";

defineProps<{ collapsed?: boolean }>();

const route = useRoute();
const { user, isSuperAdmin, signOut } = useAuth();
const { data: organizations } = useOrganizations();
const currentSlug = computed(() => String(route.params.organization ?? ""));

const items = computed<DropdownMenuItem[][]>(() => [
	[{ label: user.value?.name ?? "", description: user.value?.email, type: "label" }],
	[
		{ label: "Organizations", type: "label" },
		...organizations.value.map(organization => ({
			label: organization.name,
			description: memberRoleLabels[organization.role as MemberRole] ?? organization.role,
			type: "checkbox" as const,
			checked: organization.slug === currentSlug.value,
			onSelect: () => navigateTo(`/app/${organization.slug}`),
		})),
		{ label: "New Organization", icon: "i-material-symbols-add-rounded", to: "/app/onboard" },
	],
	...(isSuperAdmin.value
		? [[{ label: "Admin", icon: "i-material-symbols-admin-panel-settings-outline-rounded", to: "/app/admin" }]]
		: []),
	[{ label: "Sign out", icon: "i-material-symbols-logout-rounded", onSelect: () => signOut() }],
]);
</script>

<template>
	<UDropdownMenu
		v-if="user"
		:items="items"
		:content="{ side: collapsed ? 'right' : 'top', align: 'end' }"
		:ui="{ content: 'min-w-60' }"
	>
		<UButton
			color="neutral"
			variant="ghost"
			:square="collapsed"
			:block="!collapsed"
			:label="collapsed ? undefined : user.name"
			:class="collapsed ? '' : 'justify-start'"
			:aria-label="`Account menu for ${user.name}`"
		>
			<template #leading>
				<UAvatar
					:src="user.image ?? undefined"
					:alt="user.name"
					size="xs"
				/>
			</template>
		</UButton>
	</UDropdownMenu>
</template>
