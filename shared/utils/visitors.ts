const LABEL_LENGTH = 6;

// Hex a-f map to 0-5 so the number is digits only; `visitorNumberSql` in server/db/queries/visitors.ts must match.
export function visitorNumber(idOrHash: string): string {
	return Array.from(idOrHash.slice(0, LABEL_LENGTH).toLowerCase(), char => String(Number.parseInt(char, 16) % 10)).join("");
}

export function visitorLabel(idOrHash: string): string {
	return `Visitor ${visitorNumber(idOrHash)}`;
}

export function labelSearchTerm(search: string): string | null {
	const term = search.trim().toLowerCase().replace(/^visitor\s*/, "");
	return /^\d+$/.test(term) ? term : null;
}
