import { gzipSync } from "node:zlib";
import { Window } from "happy-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { minifyTrackingSnippet } from "#layers/core/tracking-snippet/build";

const snippet = await minifyTrackingSnippet();

interface SnippetPage {
	window: Window;
	fetch: ReturnType<typeof vi.fn>;
	payloads: () => Record<string, unknown>[];
	settle: () => Promise<void>;
}

const pages: Window[] = [];

afterEach(async () => {
	await Promise.all(pages.splice(0).map(page => page.happyDOM.close()));
});

function loadSnippet({ url = "https://shop.example.com/", referrer = "", siteId = "site-1" as string | null, queue = [] as unknown[][], visitorHeader = "visitor-1" } = {}): SnippetPage {
	const window = new Window({ url });
	pages.push(window);
	window.document.title = "Shop";
	Object.defineProperty(window.document, "referrer", { value: referrer });

	const script = window.document.createElement("script");
	script.src = "https://supersaasanalytics.com/sd.js";
	if (siteId) {
		script.setAttribute("data-site", siteId);
	}
	Object.defineProperty(window.document, "currentScript", { value: script });
	if (queue.length) {
		Object.assign(window, { sd: Object.assign(() => {}, { q: queue }) });
	}

	const fetch = vi.fn(async () => new Response(null, { status: 204, headers: { "sd-visitor": visitorHeader } }));
	new Function("window", "document", "location", "history", "fetch", snippet)(window, window.document, window.location, window.history, fetch);

	return {
		window,
		fetch,
		payloads: () => fetch.mock.calls.map(call => JSON.parse((call as unknown as [URL, RequestInit])[1].body as string)),
		settle: () => new Promise(resolve => setTimeout(resolve, 0)),
	};
}

function click(page: SnippetPage, selector: string) {
	(page.window.document.querySelector(selector) as unknown as HTMLElement).click();
}

function sd(page: SnippetPage) {
	return (page.window as unknown as { sd: ((name: unknown, props?: unknown) => void) & { identify: (id: unknown) => void; visitorId: () => string | null } }).sd;
}

describe("sd.js", () => {
	it("stays within 1,024 bytes gzipped", () => {
		expect(gzipSync(snippet).byteLength).toBeLessThanOrEqual(1024);
	});

	it("posts to /collect on the script's own origin", () => {
		const page = loadSnippet();
		const [endpoint, init] = page.fetch.mock.calls[0] as unknown as [URL, RequestInit];
		expect(String(endpoint)).toBe("https://supersaasanalytics.com/collect");
		expect(init).toMatchObject({ method: "POST", keepalive: true });
	});

	it("sends a Pageview with the path, title, referrer host and campaign parameters", () => {
		const page = loadSnippet({
			url: "https://shop.example.com/pricing?token=secret&utm_source=newsletter&utm_medium=email&utm_campaign=launch&utm_term=analytics&utm_content=hero#plans",
			referrer: "https://www.google.com/search?q=shop",
		});
		expect(page.payloads()).toEqual([{
			site_id: "site-1",
			path: "/pricing",
			title: "Shop",
			referrer: "www.google.com",
			utm_source: "newsletter",
			utm_medium: "email",
			utm_campaign: "launch",
			utm_term: "analytics",
			utm_content: "hero",
		}]);
	});

	it("sends nothing without a data-site attribute", () => {
		const page = loadSnippet({ siteId: null });
		expect(page.fetch).not.toHaveBeenCalled();
		expect(sd(page)).toBeUndefined();
	});

	it("sends a Pageview for each SPA route change to a new path", () => {
		const page = loadSnippet();
		page.window.history.pushState({}, "", "/pricing");
		page.window.history.replaceState({}, "", "/pricing?tab=yearly");
		page.window.history.pushState({}, "", "/docs");
		page.window.happyDOM.setURL("https://shop.example.com/pricing");
		page.window.dispatchEvent(new page.window.PopStateEvent("popstate"));
		expect(page.payloads().map(payload => payload.path)).toEqual(["/", "/pricing", "/docs", "/pricing"]);
	});

	it("records an Outbound link click without its query string", () => {
		const page = loadSnippet();
		page.window.document.body.innerHTML = `<a id="out" href="https://other.example.org/blog/post?ref=1"><span>Read</span></a><a id="in" href="/about">About</a>`;
		click(page, "#out span");
		click(page, "#in");
		expect(page.payloads().slice(1)).toEqual([{ site_id: "site-1", outbound_url: "https://other.example.org/blog/post" }]);
	});

	it("sends an Event through sd(name, props)", () => {
		const page = loadSnippet();
		sd(page)("Signup", { plan: "pro" });
		sd(page)("");
		expect(page.payloads().slice(1)).toEqual([{ site_id: "site-1", name: "Signup", props: { plan: "pro" }, path: "/" }]);
	});

	it.each([
		["tel:+441234567890", "Phone click"],
		["mailto:hi@example.com", "Email click"],
		["https://wa.me/441234567890", "WhatsApp click"],
		["https://api.whatsapp.com/send?phone=441234567890", "WhatsApp click"],
	])("records a click on %s as the %s Event, with the page path", (href, name) => {
		const page = loadSnippet({ url: "https://shop.example.com/contact" });
		page.window.document.body.innerHTML = `<a href="${href}"><span>Contact</span></a>`;
		click(page, "span");
		expect(page.payloads().slice(1)).toEqual([{ site_id: "site-1", name, path: "/contact" }]);
	});

	it("records a form submit as a Form submit Event", () => {
		const page = loadSnippet({ url: "https://shop.example.com/contact" });
		page.window.document.body.innerHTML = `<form><input name="email" value="a@example.com"></form>`;
		page.window.document.querySelector("form")!.dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
		expect(page.payloads().slice(1)).toEqual([{ site_id: "site-1", name: "Form submit", path: "/contact" }]);
	});

	it("records a click inside a data-sd-event element as that Event, with data-sd-prop-* as props", () => {
		const page = loadSnippet({ url: "https://shop.example.com/pricing" });
		page.window.document.body.innerHTML = `<button data-sd-event="Book demo" data-sd-prop-plan="pro" data-sd-prop-billing-cycle="yearly" class="cta"><b>Book</b></button>`;
		click(page, "b");
		expect(page.payloads().slice(1)).toEqual([{ site_id: "site-1", name: "Book demo", props: { "plan": "pro", "billing-cycle": "yearly" }, path: "/pricing" }]);
	});

	it("records only the data-sd-event name for a marked contact link", () => {
		const page = loadSnippet();
		page.window.document.body.innerHTML = `<a href="tel:+441234567890" data-sd-event="Call sales">Call</a>`;
		click(page, "a");
		expect(page.payloads().slice(1)).toEqual([{ site_id: "site-1", name: "Call sales", props: {}, path: "/" }]);
	});

	it("does not capture other buttons and links", () => {
		const page = loadSnippet();
		page.window.document.body.innerHTML = `<button id="plain">Menu</button><a id="internal" href="/pricing">Pricing</a><div data-sd-event=""><button id="unnamed">Go</button></div>`;
		click(page, "#plain");
		click(page, "#internal");
		click(page, "#unnamed");
		expect(page.payloads()).toHaveLength(1);
	});

	it("sends the id given to sd.identify", () => {
		const page = loadSnippet();
		sd(page).identify("user-42");
		expect(page.payloads().slice(1)).toEqual([{ site_id: "site-1", identify: "user-42" }]);
	});

	it("returns the Visitor id from the /collect response", async () => {
		const page = loadSnippet({ visitorHeader: "abc123" });
		expect(sd(page).visitorId()).toBeNull();
		await page.settle();
		expect(sd(page).visitorId()).toBe("abc123");
	});

	it("replays calls queued before the script loaded, after the Pageview", () => {
		const page = loadSnippet({ queue: [["Signup", { plan: "pro" }], ["Newsletter"]] });
		expect(page.payloads()).toMatchObject([{ path: "/" }, { name: "Signup", props: { plan: "pro" } }, { name: "Newsletter" }]);
	});

	it("no longer exposes window.wa", () => {
		const page = loadSnippet();
		expect((page.window as unknown as { wa?: unknown }).wa).toBeUndefined();
	});
});
