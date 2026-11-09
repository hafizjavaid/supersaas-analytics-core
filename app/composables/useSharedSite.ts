import type { InjectionKey, Ref } from "vue";
import type { SharedSite } from "#layers/core/shared/types/analytics";

interface SharedSiteContext {
	site: Ref<SharedSite>;
	api: string;
	basePath: string;
}

const sharedSiteKey: InjectionKey<SharedSiteContext> = Symbol("shared-site");

export function provideSharedSite(context: SharedSiteContext) {
	provide(sharedSiteKey, context);
}

export function hasSharedSite() {
	return inject(sharedSiteKey, null) !== null;
}

// Pages under `/share/[token]` render inside `ShareScope`, which provides the unlocked Share link's Site.
export function useSharedSite() {
	const context = inject(sharedSiteKey);
	if (!context) {
		throw new Error("useSharedSite() needs ShareScope as an ancestor");
	}
	return context;
}
