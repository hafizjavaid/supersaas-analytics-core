export function trackingSnippet(origin: string, siteId: string) {
	return `<script defer data-site="${siteId}" src="${origin}/sd.js"></script>`;
}
