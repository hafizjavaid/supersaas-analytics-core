<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AdminUser, AdminUserList } from "#layers/core/shared/types/admin";

definePageMeta({ middleware: ["admin"], layout: "dashboard" });
useHead({ title: "Users · Admin" });

const { adminUserActions } = useEdition();

const search = ref("");
const debouncedSearch = refDebounced(search, 250);
const page = ref(1);
watch(debouncedSearch, () => {
	page.value = 1;
});
const query = computed(() => ({ page: page.value, ...(debouncedSearch.value.trim() ? { q: debouncedSearch.value.trim() } : {}) }));
const { data, pending } = await useFetch<AdminUserList>("/api/admin/users", { query });

const passwordTarget = ref<AdminUser | null>(null);
const passwordModalOpen = computed({
	get: () => passwordTarget.value !== null,
	set: (open) => {
		if (!open) {
			passwordTarget.value = null;
		}
	},
});

const columns: TableColumn<AdminUser>[] = [
	{ id: "user", header: "User" },
	{ id: "role", header: "Role" },
	{ id: "organizations", header: () => h("div", { class: "text-right" }, "Organizations"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	{ id: "createdAt", header: "Signed up", meta: { class: { th: "hidden md:table-cell", td: "hidden md:table-cell whitespace-nowrap" } } },
	{ id: "actions", header: "" },
];
</script>

<template>
	<AppPanel
		id="admin-users"
		title="Users"
	>
		<div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
			<UCard :ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-0 sm:p-0', footer: 'px-4 py-3 sm:px-4' }">
				<template #header>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<UInput
							v-model="search"
							icon="i-material-symbols-search-rounded"
							placeholder="Search name or email"
							aria-label="Search users"
							class="w-full sm:max-w-sm"
						/>
						<span class="text-sm text-muted tabular-nums">{{ formatCount(data?.total ?? 0) }} users</span>
					</div>
				</template>

				<UTable
					:data="data?.users ?? []"
					:columns="columns"
					:loading="pending && !data"
					empty="No users match your search"
					:ui="{ th: 'py-2', td: 'py-2' }"
				>
					<template #user-cell="{ row }">
						<div class="min-w-0">
							<p class="truncate font-medium text-highlighted">
								{{ row.original.name }}
							</p>
							<p class="truncate text-sm text-muted">
								{{ row.original.email }}
								<UBadge
									v-if="!row.original.emailVerified"
									label="Unverified"
									color="neutral"
									variant="subtle"
									size="sm"
								/>
							</p>
						</div>
					</template>
					<template #role-cell="{ row }">
						<UBadge
							v-if="isSuperAdmin(row.original)"
							label="Super-admin"
							color="primary"
							variant="subtle"
						/>
						<span
							v-else
							class="text-muted"
						>User</span>
					</template>
					<template #organizations-cell="{ row }">
						{{ row.original.organizations }}
					</template>
					<template #createdAt-cell="{ row }">
						{{ formatAdminDate(row.original.createdAt) }}
					</template>
					<template #actions-cell="{ row }">
						<div class="flex justify-end gap-2">
							<UButton
								label="Set password"
								icon="i-material-symbols-key-outline-rounded"
								color="neutral"
								variant="outline"
								size="sm"
								@click="passwordTarget = row.original"
							/>
							<component
								:is="action"
								v-for="(action, index) in adminUserActions(row.original)"
								:key="index"
							/>
						</div>
					</template>
				</UTable>

				<template
					v-if="(data?.total ?? 0) > ADMIN_USERS_PAGE_SIZE"
					#footer
				>
					<UPagination
						v-model:page="page"
						:total="data?.total ?? 0"
						:items-per-page="ADMIN_USERS_PAGE_SIZE"
					/>
				</template>
			</UCard>
		</div>

		<AdminSetPasswordModal
			v-model:open="passwordModalOpen"
			:user="passwordTarget"
		/>
	</AppPanel>
</template>
