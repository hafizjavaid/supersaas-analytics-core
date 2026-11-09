// Imported here rather than in main.css, so its fonts load and preload only on the pages that call this.
import "#layers/core/app/assets/css/themes/marketing.css";

// On <body> rather than a wrapper, so teleported modals and menus get the tokens too.
export function useMarketingTheme() {
	useHead({ bodyAttrs: { class: "marketing-theme" } });
}
