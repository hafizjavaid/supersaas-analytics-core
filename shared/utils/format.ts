export function formatCompactNumber(value: number): string {
	return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
}

export function formatCount(value: number): string {
	return value.toLocaleString("en-US");
}

export function formatDuration(seconds: number): string {
	const totalSeconds = Math.max(0, Math.round(seconds));
	const minutes = Math.floor(totalSeconds / 60);
	return `${minutes}:${String(totalSeconds % 60).padStart(2, "0")}`;
}

export function formatPercent(fraction: number): string {
	return `${(fraction * 100).toFixed(1)}%`;
}

export function formatTimezoneOffset(timezone: string, date = new Date()): string {
	const parts = new Intl.DateTimeFormat("en-US", { timeZone: timezone, timeZoneName: "shortOffset" }).formatToParts(date);
	const offset = parts.find(part => part.type === "timeZoneName")?.value ?? timezone;
	// Some ICU builds print a zero offset as "GMT+0".
	return offset.replace(/^GMT[+-]0$/, "GMT");
}

// Null when the previous period is empty, so a jump from nothing shows no change rather than an infinite one.
export function percentChange(current: number, previous: number): number | null {
	if (previous === 0) {
		return current === 0 ? 0 : null;
	}
	return (current - previous) / previous;
}

export function formatChange(change: number): string {
	const percent = Math.round(change * 100);
	return `${percent > 0 ? "+" : ""}${percent}%`;
}

const BYTE_UNITS = ["KB", "MB", "GB", "TB"];

export function formatBytes(bytes: number): string {
	if (bytes < 1024) {
		return `${bytes} B`;
	}
	let value = bytes;
	let unit = -1;
	while (value >= 1024 && unit < BYTE_UNITS.length - 1) {
		value /= 1024;
		unit += 1;
	}
	return `${value.toFixed(1)} ${BYTE_UNITS[unit]}`;
}
