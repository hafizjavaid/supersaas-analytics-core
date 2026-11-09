import { slugify } from "./slug";

// Country codes that sell names one level down, so `acme.co.uk` is named after `acme`, not `co`.
const SECOND_LEVEL_LABELS = new Set(["co", "com", "net", "org", "ac", "gov", "edu"]);

export function normalizeDomain(input: string) {
	return input.trim().toLowerCase()
		.replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
		.replace(/[/?#].*$/, "")
		.replace(/:\d*$/, "")
		.replace(/\.+$/, "")
		.replace(/^www\./, "");
}

export function organizationFromDomain(domain: string) {
	const labels = domain.split(".").slice(0, -1);
	if (labels.length > 1 && SECOND_LEVEL_LABELS.has(labels.at(-1)!)) {
		labels.pop();
	}
	const label = labels.at(-1) ?? domain;
	const name = label.split("-").filter(Boolean).map(word => word[0]!.toUpperCase() + word.slice(1)).join(" ");
	return { name, slug: slugify(name) };
}
