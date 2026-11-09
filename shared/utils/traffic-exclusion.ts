interface IpAddress {
	version: 4 | 6;
	value: bigint;
}

interface IpRange extends IpAddress {
	prefix: number;
}

const IPV4_OCTET = /^(?:0|[1-9]\d{0,2})$/;
const IPV6_GROUP = /^[0-9a-f]{1,4}$/;
const IPV4_MAPPED_PREFIX = 0xFFFFn << 32n;

export const MAX_EXCLUSION_RULES = 100;

function parseIpv4(text: string): bigint | null {
	const octets = text.split(".");
	if (octets.length !== 4 || !octets.every(octet => IPV4_OCTET.test(octet) && Number(octet) <= 255)) {
		return null;
	}
	return octets.reduce((value, octet) => (value << 8n) | BigInt(octet), 0n);
}

function ipv4ToGroups(text: string): string[] | null {
	const value = parseIpv4(text);
	return value === null ? null : [(value >> 16n).toString(16), (value & 0xFFFFn).toString(16)];
}

function parseIpv6(text: string): bigint | null {
	const halves = text.split("::");
	if (halves.length > 2) {
		return null;
	}
	const toGroups = (half: string) => (half ? half.split(":") : []);
	const head = toGroups(halves[0]!);
	const tail = halves.length === 2 ? toGroups(halves[1]!) : [];
	const last = halves.length === 2 ? tail : head;
	if (last.at(-1)?.includes(".")) {
		const embedded = ipv4ToGroups(last.pop()!);
		if (!embedded) {
			return null;
		}
		last.push(...embedded);
	}
	const missing = 8 - head.length - tail.length;
	if (halves.length === 2 ? missing < 1 : missing !== 0) {
		return null;
	}
	const groups = [...head, ...Array.from({ length: halves.length === 2 ? missing : 0 }, () => "0"), ...tail];
	if (!groups.every(group => IPV6_GROUP.test(group))) {
		return null;
	}
	return groups.reduce((value, group) => (value << 16n) | BigInt(Number.parseInt(group, 16)), 0n);
}

function parseIp(text: string): IpAddress | null {
	const lowered = text.trim().toLowerCase();
	if (!lowered.includes(":")) {
		const value = parseIpv4(lowered);
		return value === null ? null : { version: 4, value };
	}
	const value = parseIpv6(lowered);
	if (value === null) {
		return null;
	}
	return (value >> 32n) === 0xFFFFn ? { version: 4, value: value - IPV4_MAPPED_PREFIX } : { version: 6, value };
}

function parseIpRange(rule: string): IpRange | null {
	const [address, prefixText, ...rest] = rule.trim().split("/");
	if (rest.length > 0 || prefixText === "" || (prefixText !== undefined && !/^\d{1,3}$/.test(prefixText))) {
		return null;
	}
	const ip = parseIp(address!);
	if (!ip) {
		return null;
	}
	const bits = ip.version === 4 ? 32 : 128;
	if (prefixText === undefined) {
		return { ...ip, prefix: bits };
	}
	// An IPv4-mapped rule's prefix counts the 96 bits of `::ffff:` in front of the IPv4 address.
	const mapped = ip.version === 4 && address!.includes(":");
	const prefix = Number(prefixText) - (mapped ? 96 : 0);
	return prefix >= 0 && prefix <= bits ? { ...ip, prefix } : null;
}

function inRange(ip: IpAddress, range: IpRange) {
	if (ip.version !== range.version) {
		return false;
	}
	const shift = BigInt((ip.version === 4 ? 32 : 128) - range.prefix);
	return (ip.value >> shift) === (range.value >> shift);
}

export function normalizeIpRule(rule: string): string | null {
	return parseIpRange(rule) ? rule.trim().toLowerCase() : null;
}

export function ipMatchesAnyRule(clientIp: string, rules: readonly string[]): boolean {
	const ip = parseIp(clientIp);
	return !!ip && rules.some((rule) => {
		const range = parseIpRange(rule);
		return !!range && inRange(ip, range);
	});
}

export function normalizePathRule(rule: string): string | null {
	const trimmed = rule.trim();
	return trimmed.startsWith("/") && trimmed.length <= 500 ? trimmed : null;
}

function globToRegExp(glob: string) {
	const pattern = glob.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
	return new RegExp(`^${pattern}$`);
}

export function pathMatchesAnyRule(path: string, rules: readonly string[]): boolean {
	return rules.some(rule => globToRegExp(rule).test(path));
}
