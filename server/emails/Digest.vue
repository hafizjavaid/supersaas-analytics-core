<script setup lang="ts">
import { computed } from "vue";
import { Text } from "@vue-email/components";
import EmailLayout from "./EmailLayout.vue";
import { DIGEST_TITLES, digestFigureRows, formatMoverChange } from "../../shared/utils/digests";
import type { DigestFrequency } from "../../shared/utils/digests";
import { formatCount } from "../../shared/utils/format";
import type { DigestReport } from "../../shared/types/digests";

const props = defineProps<{
	url: string;
	unsubscribeUrl: string;
	appName: string;
	siteName: string;
	frequency: DigestFrequency;
	periodLabel: string;
	summary: string | null;
	report: DigestReport;
}>();

const title = computed(() => DIGEST_TITLES[props.frequency]);
const figureRows = computed(() => digestFigureRows(props.report.figures, props.report.currency));
const moverSections = computed(() => [
	{ title: "Pages that moved most", unit: "pageviews", movers: props.report.pages },
	{ title: "Sources that moved most", unit: "visits", movers: props.report.sources },
].filter(section => section.movers.length > 0));

const sectionTitleStyle = { color: "#18181b", fontSize: "15px", fontWeight: "bold", margin: "24px 0 8px" };
const summaryStyle = { color: "#3f3f46", fontSize: "15px", lineHeight: "24px", margin: "0 0 16px" };
const tableStyle = { borderCollapse: "collapse" as const, width: "100%", fontSize: "14px" };
const cellStyle = { borderBottom: "1px solid #e4e4e7", color: "#3f3f46", padding: "8px 0" };
const valueStyle = { ...cellStyle, color: "#18181b", fontWeight: "bold", textAlign: "right" as const };
const mutedStyle = { ...cellStyle, color: "#71717a", textAlign: "right" as const, paddingLeft: "12px" };
const changeColors = { up: "#16a34a", down: "#dc2626", none: "#71717a" };

function changeStyle(improved: boolean | null) {
	return { ...mutedStyle, color: improved === null ? changeColors.none : improved ? changeColors.up : changeColors.down };
}
</script>

<template>
	<EmailLayout
		:preview="summary ?? `${title} for ${siteName}, ${periodLabel}`"
		:heading="`${siteName}: ${title}`"
		action-label="Open Insights"
		:action-url="url"
		:app-name="appName"
		:footnote="`You get this ${frequency} Digest of ${siteName} because you chose it in your Digest settings.`"
		:unsubscribe-url="unsubscribeUrl"
	>
		{{ periodLabel }}, compared with the period of equal length before it.
		<template #details>
			<Text
				v-if="summary"
				:style="summaryStyle"
			>
				{{ summary }}
			</Text>

			<table :style="tableStyle">
				<tbody>
					<tr
						v-for="row in figureRows"
						:key="row.label"
					>
						<td :style="cellStyle">
							{{ row.label }}
						</td>
						<td :style="valueStyle">
							{{ row.current }}
						</td>
						<td :style="mutedStyle">
							was {{ row.previous }}
						</td>
						<td :style="changeStyle(row.improved)">
							{{ row.change ?? "new" }}
						</td>
					</tr>
				</tbody>
			</table>

			<template
				v-for="section in moverSections"
				:key="section.title"
			>
				<Text :style="sectionTitleStyle">
					{{ section.title }}
				</Text>
				<table :style="tableStyle">
					<tbody>
						<tr
							v-for="mover in section.movers"
							:key="mover.label"
						>
							<td :style="cellStyle">
								{{ mover.label }}
							</td>
							<td :style="valueStyle">
								{{ formatCount(mover.current) }} {{ section.unit }}
							</td>
							<td :style="changeStyle(mover.current > mover.previous)">
								{{ formatMoverChange(mover) }}
							</td>
						</tr>
					</tbody>
				</table>
			</template>

			<template v-if="report.newSources.length">
				<Text :style="sectionTitleStyle">
					New Sources
				</Text>
				<table :style="tableStyle">
					<tbody>
						<tr
							v-for="source in report.newSources"
							:key="source.label"
						>
							<td :style="cellStyle">
								{{ source.label }}
							</td>
							<td :style="valueStyle">
								{{ formatCount(source.visits) }} visits
							</td>
						</tr>
					</tbody>
				</table>
			</template>

			<template v-if="report.goals.length">
				<Text :style="sectionTitleStyle">
					Goals
				</Text>
				<table :style="tableStyle">
					<tbody>
						<tr
							v-for="goal in report.goals"
							:key="goal.name"
						>
							<td :style="cellStyle">
								{{ goal.name }}
							</td>
							<td :style="valueStyle">
								{{ formatCount(goal.conversions.current) }} conversions
							</td>
							<td :style="mutedStyle">
								was {{ formatCount(goal.conversions.previous) }}
							</td>
						</tr>
					</tbody>
				</table>
			</template>
		</template>
	</EmailLayout>
</template>
