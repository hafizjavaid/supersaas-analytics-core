export interface HttpFailure {
	status: number;
	retryAfter: string | null;
	body: unknown;
	url: string;
}

interface ErrorBody {
	statusMessage?: string;
	message?: string;
	data?: { issues?: { message?: string }[] };
}

export class CliError extends Error {}

function asErrorBody(body: unknown): ErrorBody {
	return typeof body === "object" && body !== null ? body as ErrorBody : {};
}

export function describeHttpError({ status, retryAfter, body, url }: HttpFailure) {
	if (status === 401) {
		return `The API key was refused by ${url}. It may have been revoked: create one in Organization Settings → API keys, then run \`supersaas login\`.`;
	}
	if (status === 429) {
		const seconds = Number(retryAfter);
		return Number.isFinite(seconds) && seconds > 0
			? `Too many requests for this API key. Retry in ${seconds} seconds.`
			: "Too many requests for this API key. Retry in a minute.";
	}
	const { statusMessage, message, data } = asErrorBody(body);
	const issues = data?.issues?.map(issue => issue.message).filter(Boolean) ?? [];
	if (statusMessage && issues.length > 0) {
		return `${statusMessage}: ${issues.join("; ")}`;
	}
	return statusMessage || message || `${url} answered ${status}.`;
}
