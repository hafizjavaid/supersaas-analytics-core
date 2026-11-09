<script setup lang="ts">
import type { TableColumn } from "@nuxt/ui";
import type { AdminOrganization } from "#layers/core/shared/types/admin";

definePageMeta({ middleware: ["admin"], layout: "dashboard" });
useHead({ title: "Organizations · Admin" });

const { adminOrganizationColumns } = useEdition();
const { data: organizations, pending } = await useFetch<AdminOrganization[]>("/api/admin/organizations", { default: () => [] });

const search = ref("");
const shown = computed(() => {
	const needle = search.value.trim().toLowerCase();
	return needle
		? organizations.value.filter(row => [row.name, row.slug, row.ownerEmail ?? ""].some(text => text.toLowerCase().includes(needle)))
		: organizations.value;
});

const columns: TableColumn<AdminOrganization>[] = [
	{ id: "organization", header: "Organization" },
	...adminOrganizationColumns,
	{ id: "sites", header: () => h("div", { class: "text-right" }, "Sites"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	{ id: "members", header: () => h("div", { class: "text-right" }, "Members"), meta: { class: { th: "hidden sm:table-cell", td: "hidden sm:table-cell text-right tabular-nums" } } },
	{ id: "createdAt", header: "Created", meta: { class: { th: "hidden lg:table-cell", td: "hidden lg:table-cell whitespace-nowrap" } } },
];
</script>

<template>
	<AppPanel
		id="admin-organizations"
		title="Organizations"
	>
		<div class="mx-auto flex w-full max-w-6xl flex-col gap-4">
			<UCard :ui="{ header: 'px-4 py-3 sm:px-4', body: 'p-0 sm:p-0' }">
				<template #header>
					<div class="flex flex-wrap items-center justify-between gap-3">
						<UInput
							v-model="search"
							icon="i-material-symbols-search-rounded"
							placeholder="Search name, URL or Owner"
							aria-label="Search Organizations"
							class="w-full sm:max-w-sm"
						/>
						<span class="text-sm text-muted tabular-nums">{{ formatCount(organizations.length) }} Organizations</span>
					</div>
				</template>

				<UTable
					:data="shown"
					:columns="columns"
					:loading="pending && !organizations.length"
					empty="No Organizations"
					:ui="{ th: 'py-2', td: 'py-2' }"
				>
					<template #organization-cell="{ row }">
						<div class="min-w-0">
							<p class="truncate font-medium text-highlighted">
								{{ row.original.name }}
							</p>
							<p class="truncate text-sm text-muted">
								{{ row.original.ownerEmail ?? "No Owner" }}
							</p>
						</div>
					</template>
					<template #sites-cell="{ row }">
						{{ row.original.sites }}
					</template>
					<template #members-cell="{ row }">
						{{ row.original.members }}
					</template>
					<template #createdAt-cell="{ row }">
						{{ formatAdminDate(row.original.createdAt) }}
					</template>
				</UTable>
			</UCard>
		</div>
	</AppPanel>
</template>
