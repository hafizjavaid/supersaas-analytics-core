import { findAiAssistant, isChannel } from "./channels";
import { parseGoalFilterValue } from "./goals";

export const FILTER_DIMENSIONS = [
	"page",
	"entry_page",
	"exit_page",
	"channel",
	"ai_assistant",
	"referrer",
	"utm_source",
	"utm_medium",
	"utm_campaign",
	"utm_term",
	"utm_content",
	"country",
	"region",
	"city",
	"browser",
	"os",
	"device",
	"event",
	"goal",
] as const;

export type FilterDimension = typeof FILTER_DIMENSIONS[number];

export interface Filter {
	dimension: FilterDimension;
	value: string;
}

export interface Place {
	country: string;
	name: string;
}

const MAX_VALUE_LENGTH = 512;
const PLACE_PATTERN = /^([A-Z]{2})-(.+)$/s;

function isFilterDimension(value: string): value is FilterDimension {
	return FILTER_DIMENSIONS.includes(value as FilterDimension);
}

// Region and city names repeat across countries, so their values carry the country: `CH-BE`, `US-Portland`.
export function parsePlace(value: string): Place | null {
	const match = PLACE_PATTERN.exec(value);
	return match ? { country: match[1]!, name: match[2]! } : null;
}

export function parseFilter(raw: unknown): Filter | null {
	if (typeof raw !== "string") {
		return null;
	}
	const separator = raw.indexOf(":");
	const dimension = raw.slice(0, separator);
	const value = raw.slice(separator + 1);
	if (separator < 1 || !isFilterDimension(dimension) || !value || value.length > MAX_VALUE_LENGTH) {
		return null;
	}
	if ((dimension === "region" || dimension === "city") && !parsePlace(value)) {
		return null;
	}
	if ((dimension === "channel" && !isChannel(value)) || (dimension === "ai_assistant" && !findAiAssistant(value))) {
		return null;
	}
	if (dimension === "goal" && !parseGoalFilterValue(value)) {
		return null;
	}
	return { dimension, value };
}

// Invalid entries are dropped, like an unknown Range, and a Dimension filtered twice keeps its last value.
export function parseFilters(raw: unknown): Filter[] {
	const entries = Array.isArray(raw) ? raw : [raw];
	return entries.reduce<Filter[]>((filters, entry) => {
		const filter = parseFilter(entry);
		return filter ? withFilter(filters, filter) : filters;
	}, []);
}

export function serializeFilter(filter: Filter): string {
	return `${filter.dimension}:${filter.value}`;
}

export function withFilter(filters: Filter[], filter: Filter): Filter[] {
	return filters.some(existing => existing.dimension === filter.dimension)
		? filters.map(existing => existing.dimension === filter.dimension ? filter : existing)
		: [...filters, filter];
}

export function withoutFilter(filters: Filter[], dimension: FilterDimension): Filter[] {
	return filters.filter(filter => filter.dimension !== dimension);
}
