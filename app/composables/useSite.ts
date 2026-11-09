import type { InjectionKey, Ref } from "vue";
import type { Site } from "#layers/core/shared/types/analytics";

interface SiteContext {
	site: Ref<Site>;
	refresh: () => Promise<void>;
}

const siteKey: InjectionKey<SiteContext> = Symbol("site");

export function provideSite(context: SiteContext) {
	provide(siteKey, context);
}

// Pages under `/app/[organization]/sites/[site]` render inside `sites/[site].vue`, which loads and provides it.
export function useSite() {
	const context = inject(siteKey);
	if (!context) {
		throw new Error("useSite() needs pages/app/[organization]/sites/[site].vue as an ancestor");
	}
	const { organization } = useOrganization();
	return {
		...context,
		basePath: computed(() => `/app/${organization.value.slug}/sites/${context.site.value.id}`),
		api: computed(() => `/api/sites/${context.site.value.id}`),
	};
}
