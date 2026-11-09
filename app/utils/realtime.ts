import type { Realtime, RealtimeChip, VisitorPlace } from "#layers/core/shared/types/analytics";
import { countryName } from "#layers/core/shared/utils/countries";

export interface RealtimeChipGroup {
	key: "referrers" | "countries" | "devices";
	label: string;
	chips: (RealtimeChip & { label: string })[];
}

export const DEVICE_LABELS: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", tablet: "Tablet" };

export function realtimeChipGroups(realtime: Pick<Realtime, "referrers" | "countries" | "devices">): RealtimeChipGroup[] {
	return [
		{ key: "referrers", label: "Referrers", chips: realtime.referrers.map(chip => ({ ...chip, label: chip.value === "(direct)" ? "Direct" : chip.value })) },
		{ key: "countries", label: "Countries", chips: realtime.countries.map(chip => ({ ...chip, label: countryName(chip.value) })) },
		{ key: "devices", label: "Devices", chips: realtime.devices.map(chip => ({ ...chip, label: DEVICE_LABELS[chip.value] ?? chip.value })) },
	];
}

export function placeLabel(location: VisitorPlace | null): string {
	if (!location) {
		return "Unknown location";
	}
	return location.city ? `${location.city}, ${countryName(location.country)}` : countryName(location.country);
}

export const EMPTY_REALTIME: Realtime = {
	count: 0,
	locations: [],
	pageviews: { total: 0, peak: 0, points: [] },
	referrers: [],
	countries: [],
	devices: [],
	visitors: [],
};
