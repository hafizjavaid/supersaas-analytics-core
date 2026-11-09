export function useTrackerOrigin() {
	const configured = useRuntimeConfig().public.trackerOrigin;
	const pageOrigin = useRequestURL().origin;
	return computed(() => (configured ? new URL(configured).origin : pageOrigin));
}
