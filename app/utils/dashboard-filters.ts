import type { Filter, FilterDimension } from "#layers/core/shared/utils/filters";
import { parsePlace, serializeFilter } from "#layers/core/shared/utils/filters";
import { CHANNEL_LABELS, findAiAssistant, isChannel } from "#layers/core/shared/utils/channels";
import { countryName } from "#layers/core/shared/utils/countries";
import { describeGoal, parseGoalFilterValue } from "#layers/core/shared/utils/goals";

export const FILTER_LABELS: Record<FilterDimension, string> = {
	page: "Page",
	entry_page: "Entry page",
	exit_page: "Exit page",
	channel: "Channel",
	ai_assistant: "AI assistant",
	referrer: "Referrer",
	utm_source: "UTM source",
	utm_medium: "UTM medium",
	utm_campaign: "UTM campaign",
	utm_term: "UTM term",
	utm_content: "UTM content",
	country: "Country",
	region: "Region",
	city: "City",
	browser: "Browser",
	os: "OS",
	device: "Device",
	event: "Event",
	goal: "Goal",
};

export function filterValueLabel(filter: Filter): string {
	if (filter.dimension === "country") {
		return countryName(filter.value);
	}
	if (filter.dimension === "region" || filter.dimension === "city") {
		const place = parsePlace(filter.value);
		return place ? `${place.name}, ${countryName(place.country)}` : filter.value;
	}
	if (filter.dimension === "channel" && isChannel(filter.value)) {
		return CHANNEL_LABELS[filter.value];
	}
	if (filter.dimension === "ai_assistant") {
		return findAiAssistant(filter.value)?.name ?? filter.value;
	}
	if (filter.dimension === "referrer" && filter.value === "(direct)") {
		return "Direct";
	}
	if (filter.dimension === "goal") {
		const goal = parseGoalFilterValue(filter.value);
		return goal ? describeGoal(goal) : filter.value;
	}
	if (filter.dimension === "device") {
		return `${filter.value.charAt(0).toUpperCase()}${filter.value.slice(1)}`;
	}
	return filter.value;
}

export function filtersReportQuery(filters: Filter[]): ReportQuery {
	return filters.length > 0 ? { f: filters.map(serializeFilter) } : {};
}
