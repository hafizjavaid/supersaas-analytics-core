export const HOSTED_SITE_URL = "https://supersaasanalytics.com";

export function hostedDocsUrl(path: string) {
	return `${HOSTED_SITE_URL}/docs/${path}`;
}
