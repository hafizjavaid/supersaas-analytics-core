declare global {
	// Fields the Hosted layer adds to Organization rows through `serverEdition().organizationColumns`; none in core.
	// eslint-disable-next-line @typescript-eslint/no-empty-object-type
	interface OrganizationExtras {}
}

export {};
