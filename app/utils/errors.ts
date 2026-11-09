interface ApiIssue {
	path: PropertyKey[];
	message: string;
}

interface ApiErrorBody {
	message?: string;
	statusMessage?: string;
	data?: { issues?: ApiIssue[] };
}

interface FetchFailure {
	status?: number;
	data?: ApiErrorBody;
}

const UNREACHABLE = "Could not reach the server. Check your connection and try again.";

export function describeError(caught: unknown, fallback = "Something went wrong. Please try again.") {
	const { status, data } = (caught ?? {}) as FetchFailure;
	if (!status) {
		return caught instanceof TypeError || (caught as { name?: string })?.name === "FetchError" ? UNREACHABLE : fallback;
	}
	const issues = data?.data?.issues;
	if (issues?.length) {
		return issues.map(formatIssue).join(" ");
	}
	// A 5xx message is a raw server or database error, which means nothing to the user.
	if (status >= 500) {
		return fallback;
	}
	return data?.message || data?.statusMessage || fallback;
}

function formatIssue({ path, message }: ApiIssue) {
	const field = path.map(String).join(".");
	if (!field) {
		return message;
	}
	return `${field.charAt(0).toUpperCase()}${field.slice(1)}: ${message}`;
}
