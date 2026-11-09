<script setup lang="ts">
useHead({ title: "Filtering" });

const { site, refresh } = useSite();
const { can } = useOrganization();
const editable = computed(() => can({ site: ["update"] }));
</script>

<template>
	<SiteExclusionRules
		:site="site"
		field="excludedIps"
		title="Ignore internal traffic"
		description="Visits from these IP addresses are never stored, so your own browsing does not show up in the numbers."
		label="IP address or CIDR range"
		placeholder="203.0.113.7 or 203.0.113.0/24"
		help="IPv4 and IPv6 both work."
		invalid-message="Enter an IP address such as 203.0.113.7 or a CIDR range such as 203.0.113.0/24"
		:normalize="normalizeIpRule"
		:editable="editable"
		offer-current-ip
		@saved="refresh"
	/>
	<SiteExclusionRules
		:site="site"
		field="excludedPaths"
		title="Excluded paths"
		description="Pageviews and Events on these paths are never stored."
		label="Path or glob"
		placeholder="/admin/*"
		help="* matches any characters, including /. /admin/* covers /admin/users but not /admin itself."
		invalid-message="Start the path with /"
		:normalize="normalizePathRule"
		:editable="editable"
		@saved="refresh"
	/>
	<UCard>
		<template #header>
			<h2 class="font-semibold text-highlighted">
				Bots
			</h2>
		</template>
		<p class="text-sm text-muted">
			Known crawlers, headless browsers, uptime monitors and scripts are always ignored. Nothing to set up.
		</p>
	</UCard>
</template>
