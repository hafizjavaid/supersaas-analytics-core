export const CHANNELS = ["direct", "search", "social", "ai", "email", "paid", "referral"] as const;

export type Channel = typeof CHANNELS[number];

export const CHANNEL_LABELS: Record<Channel, string> = {
	direct: "Direct",
	search: "Search",
	social: "Social",
	ai: "AI assistant",
	email: "Email",
	paid: "Paid",
	referral: "Referral",
};

export interface ChannelSource {
	referrerDomain: string;
	utmSource?: string | null;
	utmMedium?: string | null;
}

export interface AiAssistant {
	domain: string;
	name: string;
	referrers: string[];
	utmSources: string[];
}

// Referrers are compared exactly as stored (lower case, without www.); UTM sources in lower case.
export const AI_ASSISTANTS: AiAssistant[] = [
	{ domain: "chatgpt.com", name: "ChatGPT", referrers: ["chatgpt.com", "chat.openai.com"], utmSources: ["chatgpt.com", "chatgpt", "openai"] },
	{ domain: "perplexity.ai", name: "Perplexity", referrers: ["perplexity.ai"], utmSources: ["perplexity.ai", "perplexity"] },
	{ domain: "gemini.google.com", name: "Gemini", referrers: ["gemini.google.com", "bard.google.com"], utmSources: ["gemini.google.com", "gemini"] },
	{ domain: "claude.ai", name: "Claude", referrers: ["claude.ai"], utmSources: ["claude.ai", "claude"] },
	{ domain: "copilot.microsoft.com", name: "Copilot", referrers: ["copilot.microsoft.com", "copilot.cloud.microsoft"], utmSources: ["copilot.microsoft.com", "copilot"] },
	{ domain: "chat.deepseek.com", name: "DeepSeek", referrers: ["chat.deepseek.com"], utmSources: ["deepseek"] },
	{ domain: "grok.com", name: "Grok", referrers: ["grok.com"], utmSources: ["grok.com", "grok"] },
	{ domain: "chat.mistral.ai", name: "Le Chat", referrers: ["chat.mistral.ai"], utmSources: ["chat.mistral.ai", "mistral"] },
	{ domain: "meta.ai", name: "Meta AI", referrers: ["meta.ai"], utmSources: ["meta.ai"] },
	{ domain: "you.com", name: "You.com", referrers: ["you.com"], utmSources: ["you.com"] },
	{ domain: "phind.com", name: "Phind", referrers: ["phind.com"], utmSources: ["phind.com", "phind"] },
	{ domain: "poe.com", name: "Poe", referrers: ["poe.com"], utmSources: ["poe.com", "poe"] },
];

export const AI_REFERRERS = AI_ASSISTANTS.flatMap(assistant => assistant.referrers);

// "name.*" stands for any country domain: google.com, google.co.uk, google.de.
const SEARCH_DOMAINS = [
	"google.*",
	"bing.com",
	"duckduckgo.com",
	"search.yahoo.com",
	"yahoo.co.jp",
	"yandex.*",
	"baidu.com",
	"ecosia.org",
	"search.brave.com",
	"startpage.com",
	"qwant.com",
	"naver.com",
	"seznam.cz",
	"kagi.com",
];
const SEARCH_UTM_SOURCES = ["google", "bing", "duckduckgo", "yahoo", "yandex", "baidu", "ecosia", "brave", "qwant", "naver", "kagi"];

const SOCIAL_DOMAINS = [
	"facebook.com",
	"fb.com",
	"fb.me",
	"messenger.com",
	"instagram.com",
	"threads.net",
	"threads.com",
	"t.co",
	"twitter.com",
	"x.com",
	"linkedin.com",
	"lnkd.in",
	"reddit.com",
	"news.ycombinator.com",
	"youtube.com",
	"youtu.be",
	"tiktok.com",
	"pinterest.*",
	"snapchat.com",
	"tumblr.com",
	"quora.com",
	"bsky.app",
	"mastodon.social",
	"discord.com",
	"t.me",
	"vk.com",
	"weibo.com",
];
const SOCIAL_UTM_SOURCES = [
	"facebook",
	"fb",
	"instagram",
	"ig",
	"threads",
	"twitter",
	"x",
	"linkedin",
	"reddit",
	"hackernews",
	"youtube",
	"tiktok",
	"pinterest",
	"snapchat",
	"bluesky",
	"mastodon",
	"discord",
];
const SOCIAL_MEDIUMS = ["social", "social-network", "social-media", "sm", "social network", "social media"];

const EMAIL_DOMAINS = [
	"mail.google.com",
	"outlook.live.com",
	"outlook.office.com",
	"outlook.office365.com",
	"mail.yahoo.com",
	"mail.proton.me",
	"app.fastmail.com",
	"mail.aol.com",
];
const EMAIL_VALUES = ["email", "e-mail", "e_mail", "e mail", "newsletter"];

// The paid-traffic medium pattern Google Analytics uses, plus display advertising.
const PAID_MEDIUM = /^(?:.*cp.*|ppc|retargeting|paid.*|display|banner)$/;

function domainPattern(domain: string): RegExp {
	const anyCountry = domain.endsWith(".*");
	const base = (anyCountry ? domain.slice(0, -2) : domain).replaceAll(".", "\\.");
	return new RegExp(`(?:^|\\.)${base}${anyCountry ? "\\.[a-z]{2,3}(?:\\.[a-z]{2})?" : ""}$`);
}

function domainMatcher(domains: string[]) {
	const patterns = domains.map(domainPattern);
	return (host: string) => patterns.some(pattern => pattern.test(host));
}

const isSearchDomain = domainMatcher(SEARCH_DOMAINS);
const isSocialDomain = domainMatcher(SOCIAL_DOMAINS);
const isEmailDomain = domainMatcher(EMAIL_DOMAINS);

export function isChannel(value: string): value is Channel {
	return CHANNELS.includes(value as Channel);
}

export function aiAssistantOf({ referrerDomain, utmSource }: ChannelSource): AiAssistant | undefined {
	const byReferrer = AI_ASSISTANTS.find(assistant => assistant.referrers.includes(referrerDomain));
	if (byReferrer) {
		return byReferrer;
	}
	const source = utmSource?.toLowerCase();
	return source ? AI_ASSISTANTS.find(assistant => assistant.utmSources.includes(source)) : undefined;
}

export function findAiAssistant(domain: string): AiAssistant | undefined {
	return AI_ASSISTANTS.find(assistant => assistant.domain === domain);
}

// Order matters: an ad on Google is Paid, not Search, and gemini.google.com is an AI assistant, not Search.
export function classifyChannel(input: ChannelSource): Channel {
	const referrer = input.referrerDomain;
	const source = input.utmSource?.trim().toLowerCase() ?? "";
	const medium = input.utmMedium?.trim().toLowerCase() ?? "";
	const direct = referrer === "(direct)";

	if (medium && PAID_MEDIUM.test(medium)) {
		return "paid";
	}
	if (aiAssistantOf(input)) {
		return "ai";
	}
	if (EMAIL_VALUES.includes(medium) || EMAIL_VALUES.includes(source) || (!direct && isEmailDomain(referrer))) {
		return "email";
	}
	if (SOCIAL_MEDIUMS.includes(medium) || SOCIAL_UTM_SOURCES.includes(source) || (!direct && isSocialDomain(referrer))) {
		return "social";
	}
	if (medium === "organic" || SEARCH_UTM_SOURCES.includes(source) || (!direct && isSearchDomain(referrer))) {
		return "search";
	}
	return direct && !source && !medium ? "direct" : "referral";
}
