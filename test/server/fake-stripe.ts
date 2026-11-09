import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { FAKE_STRIPE_PORT, stripeCustomerEmail, TEST_STRIPE_KEY, TEST_STRIPE_KEY_WITHOUT_CUSTOMERS, TEST_STRIPE_LIVE_KEY, TEST_STRIPE_KEY_WITHOUT_SESSIONS, UNKNOWN_STRIPE_CUSTOMER_ID } from "./stripe";

function json(response: ServerResponse, status: number, body: unknown) {
	response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

function stripeError(response: ServerResponse, status: number, message: string) {
	json(response, status, { error: { type: "invalid_request_error", message } });
}

const RESOURCES = [
	{ prefix: "/v1/customers", deniedTo: TEST_STRIPE_KEY_WITHOUT_CUSTOMERS, read: (id: string) => ({ id, object: "customer", email: stripeCustomerEmail(id) }) },
	{ prefix: "/v1/checkout/sessions", deniedTo: TEST_STRIPE_KEY_WITHOUT_SESSIONS, read: (id: string) => ({ id, object: "checkout.session", customer_details: { email: stripeCustomerEmail(id) } }) },
];

export async function startFakeStripe() {
	const keys = new Set([TEST_STRIPE_KEY, TEST_STRIPE_LIVE_KEY, TEST_STRIPE_KEY_WITHOUT_CUSTOMERS, TEST_STRIPE_KEY_WITHOUT_SESSIONS]);
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://fake-stripe");
		const key = request.headers.authorization?.replace(/^Bearer /, "") ?? "";
		const resource = RESOURCES.find(entry => url.pathname === entry.prefix || url.pathname.startsWith(`${entry.prefix}/`));
		if (request.method !== "GET" || !resource) {
			return stripeError(response, 404, "Unrecognized request URL");
		}
		if (!keys.has(key)) {
			return stripeError(response, 401, "Invalid API Key provided");
		}
		if (key === resource.deniedTo) {
			return stripeError(response, 403, "The provided key does not have the required permissions for this endpoint");
		}
		const id = decodeURIComponent(url.pathname.slice(resource.prefix.length + 1));
		if (!id) {
			return json(response, 200, { object: "list", data: [], has_more: false, url: resource.prefix });
		}
		if (id === UNKNOWN_STRIPE_CUSTOMER_ID) {
			return stripeError(response, 404, `No such customer: '${id}'`);
		}
		json(response, 200, resource.read(id));
	});
	await new Promise<void>(resolve => server.listen(FAKE_STRIPE_PORT, "127.0.0.1", resolve));
	return () => new Promise<void>(resolve => server.close(() => resolve()));
}
