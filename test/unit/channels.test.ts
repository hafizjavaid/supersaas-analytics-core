import { describe, expect, it } from "vitest";
import type { ChannelSource } from "#layers/core/shared/utils/channels";
import { AI_ASSISTANTS, aiAssistantOf, classifyChannel, isChannel } from "#layers/core/shared/utils/channels";

function source(referrerDomain: string, utmSource: string | null = null, utmMedium: string | null = null): ChannelSource {
	return { referrerDomain, utmSource, utmMedium };
}

describe("classifyChannel", () => {
	it.each([
		[source("(direct)"), "direct"],
		[source("(direct)", null, null), "direct"],

		[source("google.com"), "search"],
		[source("google.co.uk"), "search"],
		[source("google.de"), "search"],
		[source("news.google.com"), "search"],
		[source("bing.com"), "search"],
		[source("duckduckgo.com"), "search"],
		[source("search.yahoo.com"), "search"],
		[source("yandex.ru"), "search"],
		[source("baidu.com"), "search"],
		[source("ecosia.org"), "search"],
		[source("search.brave.com"), "search"],
		[source("(direct)", "google"), "search"],
		[source("(direct)", "newsletter-site", "organic"), "search"],

		[source("t.co"), "social"],
		[source("x.com"), "social"],
		[source("twitter.com"), "social"],
		[source("facebook.com"), "social"],
		[source("l.facebook.com"), "social"],
		[source("m.facebook.com"), "social"],
		[source("instagram.com"), "social"],
		[source("linkedin.com"), "social"],
		[source("lnkd.in"), "social"],
		[source("reddit.com"), "social"],
		[source("old.reddit.com"), "social"],
		[source("news.ycombinator.com"), "social"],
		[source("youtube.com"), "social"],
		[source("tiktok.com"), "social"],
		[source("bsky.app"), "social"],
		[source("pinterest.co.uk"), "social"],
		[source("(direct)", "linkedin"), "social"],
		[source("(direct)", "Facebook"), "social"],
		[source("(direct)", "partner", "social"), "social"],

		[source("chatgpt.com"), "ai"],
		[source("chat.openai.com"), "ai"],
		[source("perplexity.ai"), "ai"],
		[source("gemini.google.com"), "ai"],
		[source("claude.ai"), "ai"],
		[source("copilot.microsoft.com"), "ai"],
		[source("(direct)", "chatgpt.com"), "ai"],
		[source("(direct)", "ChatGPT.com"), "ai"],

		[source("(direct)", "newsletter", "email"), "email"],
		[source("(direct)", "newsletter"), "email"],
		[source("(direct)", "mailchimp", "e-mail"), "email"],
		[source("mail.google.com"), "email"],
		[source("outlook.live.com"), "email"],
		[source("google.com", "newsletter", "email"), "email"],

		[source("google.com", "google", "cpc"), "paid"],
		[source("(direct)", "facebook", "paid-social"), "paid"],
		[source("bing.com", "bing", "ppc"), "paid"],
		[source("(direct)", "network", "display"), "paid"],
		[source("(direct)", "retargeter", "retargeting"), "paid"],
		[source("chatgpt.com", "chatgpt", "cpc"), "paid"],

		[source("github.com"), "referral"],
		[source("dev.to"), "referral"],
		[source("producthunt.com"), "referral"],
		[source("notgoogle.com"), "referral"],
		[source("google.example.org"), "referral"],
		[source("(direct)", "partner"), "referral"],
		[source("(direct)", null, "affiliate"), "referral"],
		[source("producthunt.com", "product-hunt", "referral"), "referral"],
	] as const)("maps %j to %s", (input, channel) => {
		expect(classifyChannel(input)).toBe(channel);
	});

	it("ignores UTM term, content and campaign", () => {
		expect(classifyChannel({ referrerDomain: "(direct)", utmSource: "", utmMedium: "" })).toBe("direct");
	});
});

describe("aiAssistantOf", () => {
	it("names the assistant a referrer belongs to", () => {
		expect(aiAssistantOf(source("chat.openai.com"))?.name).toBe("ChatGPT");
		expect(aiAssistantOf(source("perplexity.ai"))?.domain).toBe("perplexity.ai");
	});

	it("falls back to the UTM source when the assistant hid the referrer", () => {
		expect(aiAssistantOf(source("(direct)", "chatgpt.com"))?.domain).toBe("chatgpt.com");
	});

	it("prefers the referrer over the UTM source", () => {
		expect(aiAssistantOf(source("claude.ai", "chatgpt.com"))?.domain).toBe("claude.ai");
	});

	it("finds nothing for other Sources", () => {
		expect(aiAssistantOf(source("google.com"))).toBeUndefined();
		expect(aiAssistantOf(source("(direct)"))).toBeUndefined();
	});

	it("lists the assistants the ticket names", () => {
		expect(AI_ASSISTANTS.map(assistant => assistant.domain)).toEqual(expect.arrayContaining([
			"chatgpt.com",
			"perplexity.ai",
			"gemini.google.com",
			"claude.ai",
			"copilot.microsoft.com",
		]));
	});
});

describe("isChannel", () => {
	it("accepts Channel keys only", () => {
		expect(isChannel("ai")).toBe(true);
		expect(isChannel("AI assistant")).toBe(false);
	});
});
