import type { FunnelStep } from "./funnels";

export const MAX_JOURNEY_DEPTH = 10;
const MAX_PATH_LENGTH = 2048;

export interface JourneyNode {
	path: string;
	visitors: number;
	selected: boolean;
}

export interface JourneyGroup {
	segment: string;
	visitors: number;
	selected: boolean;
	nodes: JourneyNode[];
}

// Each selected node only makes sense after the ones before it, so an invalid node ends the chain.
export function parseJourneyPath(value: unknown): string[] {
	const candidates = Array.isArray(value) ? value : value === undefined ? [] : [value];
	const path: string[] = [];
	for (const candidate of candidates) {
		if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > MAX_PATH_LENGTH || path.length === MAX_JOURNEY_DEPTH) {
			break;
		}
		path.push(candidate);
	}
	return path;
}

export function firstSegment(path: string) {
	const segment = path.split("/").find(part => part !== "");
	return segment === undefined ? "/" : `/${segment}`;
}

function byVolume<T extends { visitors: number }>(name: (item: T) => string) {
	return (a: T, b: T) => b.visitors - a.visitors || name(a).localeCompare(name(b));
}

const nodeOrder = byVolume<JourneyNode>(node => node.path);

export function groupStartingPoints(nodes: JourneyNode[]): JourneyGroup[] {
	const groups = new Map<string, JourneyGroup>();
	for (const node of nodes) {
		const segment = firstSegment(node.path);
		const group = groups.get(segment) ?? { segment, visitors: 0, selected: false, nodes: [] };
		group.visitors += node.visitors;
		group.selected ||= node.selected;
		group.nodes.push(node);
		groups.set(segment, group);
	}
	return [...groups.values()]
		.map(group => ({ ...group, nodes: group.nodes.toSorted(nodeOrder) }))
		.sort(byVolume(group => group.segment));
}

export function topJourneyNodes(nodes: JourneyNode[], limit: number) {
	const sorted = nodes.toSorted(nodeOrder);
	return [...sorted.slice(0, limit), ...sorted.slice(limit).filter(node => node.selected)];
}

export function journeyStartOfFunnel(steps: FunnelStep[]): string[] {
	const first = steps[0];
	return first?.kind === "page" && !first.value.includes("*") ? [first.value] : [];
}
