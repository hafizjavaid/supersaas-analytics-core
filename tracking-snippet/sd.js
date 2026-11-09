// Cookieless: nothing is read from or written to cookies or storage. The server derives the Visitor from IP and User-Agent.
// The build minifies this file into public/sd.js, and test/unit/tracking-snippet.test.ts fails it above 1,024 bytes gzipped.
(() => {
	const script = document.currentScript;
	const siteId = script && script.getAttribute("data-site");
	if (!siteId) {
		return;
	}

	const endpoint = new URL("/collect", script.src);
	let visitorId = null;
	let lastPath;

	// A string body keeps the request CORS-simple (text/plain, no preflight), and keepalive lets it outlive an unloading page.
	const send = (payload) => {
		payload.site_id = siteId;
		fetch(endpoint, { method: "POST", body: JSON.stringify(payload), keepalive: true })
			.then((response) => {
				visitorId = response.headers.get("sd-visitor") || visitorId;
			})
			.catch(() => {});
	};

	// The query string and hash are left out of the path because they can hold personal data; only campaign parameters are kept.
	const trackPageview = () => {
		const path = location.pathname;
		if (path === lastPath) {
			return;
		}
		lastPath = path;

		const payload = { path, title: document.title, referrer: document.referrer ? new URL(document.referrer).hostname : null };
		const search = new URLSearchParams(location.search);
		for (const part of ["source", "medium", "campaign", "term", "content"]) {
			const value = search.get("utm_" + part);
			if (value) {
				payload["utm_" + part] = value;
			}
		}
		send(payload);
	};

	const track = (name, props) => {
		if (name) {
			send({ name: String(name), props, path: location.pathname });
		}
	};

	// Only links and elements a Site marks are captured, never every button.
	const trackClick = (event) => {
		const target = event.target;
		const marked = target.closest && target.closest("[data-sd-event]");
		if (marked) {
			const props = {};
			for (const { name, value } of marked.attributes) {
				if (name.startsWith("data-sd-prop-")) {
					props[name.slice(13)] = value;
				}
			}
			track(marked.getAttribute("data-sd-event"), props);
		}

		const anchor = target.closest && target.closest("a[href]");
		if (!anchor) {
			return;
		}
		try {
			const url = new URL(anchor.href, location.href);
			const contact = { "tel:": "Phone click", "mailto:": "Email click" }[url.protocol]
				|| (/^(wa\.me|api\.whatsapp\.com)$/.test(url.hostname) && "WhatsApp click");
			if (contact) {
				if (!marked) {
					track(contact);
				}
			}
			else if (/^https?:$/.test(url.protocol) && url.hostname !== location.hostname) {
				send({ outbound_url: url.origin + url.pathname });
			}
		}
		catch {
			// An href the URL parser rejects is neither a contact nor an Outbound link.
		}
	};

	for (const method of ["pushState", "replaceState"]) {
		const original = history[method];
		history[method] = function (...args) {
			original.apply(this, args);
			trackPageview();
		};
	}
	window.addEventListener("popstate", trackPageview);
	document.addEventListener("click", trackClick, true);
	document.addEventListener("submit", () => track("Form submit"), true);

	const queued = (window.sd && window.sd.q) || [];
	const sd = (window.sd = track);
	sd.identify = (id) => {
		if (id) {
			send({ identify: String(id) });
		}
	};
	sd.visitorId = () => visitorId;

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", trackPageview);
	}
	else {
		trackPageview();
	}
	for (const args of queued) {
		sd(...args);
	}
})();
