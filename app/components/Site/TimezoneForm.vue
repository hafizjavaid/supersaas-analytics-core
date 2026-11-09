<script setup lang="ts">
import type { Site } from "#layers/core/shared/types/analytics";

const props = defineProps<{ site: Site; editable: boolean }>();
const emit = defineEmits<{ saved: [] }>();

const notify = useNotify();
const timezone = ref(props.site.timezone);
const pending = ref(false);
const timezones = Intl.supportedValuesOf("timeZone");
const items = timezones.includes("UTC") ? timezones : ["UTC", ...timezones];
const offsetLabel = computed(() => formatTimezoneOffset(timezone.value));

watch(() => props.site.timezone, (saved) => {
	timezone.value = saved;
});

async function save() {
	pending.value = true;
	try {
		await $fetch(`/api/sites/${props.site.id}`, { method: "PATCH", body: { timezone: timezone.value } });
		notify.success("Timezone saved", `${props.site.name} now reports in ${timezone.value}.`);
		emit("saved");
	}
	catch (caught) {
		notify.error("Could not save the timezone", caught);
	}
	finally {
		pending.value = false;
	}
}
</script>

<template>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Timezone
			</h2>
			<p class="text-sm text-muted">
				Days, charts and Rollups follow this timezone. Changing it does not move days already rolled up.
			</p>
		</template>
		<form
			class="flex flex-col gap-3 sm:flex-row sm:items-end"
			@submit.prevent="save"
		>
			<UFormField
				label="Timezone"
				:help="`Currently ${offsetLabel}`"
				class="flex-1"
			>
				<USelectMenu
					v-model="timezone"
					:items="items"
					:disabled="!editable"
					class="w-full"
				/>
			</UFormField>
			<UButton
				v-if="editable"
				type="submit"
				label="Save"
				:loading="pending"
				:disabled="timezone === site.timezone"
			/>
		</form>
	</UCard>
</template>
