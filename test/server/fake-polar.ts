import { createServer } from "node:http";
import type { ServerResponse } from "node:http";
import { FAKE_POLAR_PORT, polarCustomerEmail, TEST_SITE_POLAR_TOKEN, TEST_SITE_POLAR_TOKEN_WITHOUT_SCOPE, UNKNOWN_POLAR_CUSTOMER_ID } from "./polar";

function json(response: ServerResponse, status: number, body: unknown) {
	response.writeHead(status, { "content-type": "application/json" }).end(JSON.stringify(body));
}

// A Site's Revenue connection reads customers with its own token.
function answerCustomers(url: URL, authorization: string | undefined, response: ServerResponse) {
	if (authorization === `Bearer ${TEST_SITE_POLAR_TOKEN_WITHOUT_SCOPE}`) {
		return json(response, 403, { error: "InsufficientScope" });
	}
	if (authorization !== `Bearer ${TEST_SITE_POLAR_TOKEN}`) {
		return json(response, 401, { error: "Unauthorized" });
	}
	const customerId = decodeURIComponent(url.pathname.slice("/v1/customers/".length));
	if (!customerId) {
		return json(response, 200, { items: [], pagination: { total_count: 0, max_page: 0 } });
	}
	if (customerId === UNKNOWN_POLAR_CUSTOMER_ID) {
		return json(response, 404, { error: "ResourceNotFound" });
	}
	return json(response, 200, { id: customerId, email: polarCustomerEmail(customerId) });
}

// Records checkout requests and answers each with an error, so a test can assert what the server sent to Polar.
export async function startFakePolar() {
	const checkouts: unknown[] = [];
	const server = createServer((request, response) => {
		const url = new URL(request.url ?? "/", "http://fake-polar");
		if (request.method === "GET" && url.pathname === "/__requests") {
			return json(response, 200, checkouts);
		}
		if (request.method === "GET" && url.pathname.startsWith("/v1/customers/")) {
			return answerCustomers(url, request.headers.authorization, response);
		}
		let body = "";
		request.on("data", (chunk) => {
			body += chunk;
		});
		request.on("end", () => {
			if (request.method === "POST" && url.pathname.startsWith("/v1/checkouts")) {
				checkouts.push(JSON.parse(body));
			}
			json(response, 400, { error: "FakePolar", detail: "Not implemented" });
		});
	});
	await new Promise<void>(resolve => server.listen(FAKE_POLAR_PORT, "127.0.0.1", resolve));
	return () => new Promise<void>(resolve => server.close(() => resolve()));
}
