export function useDemo() {
	const route = useRoute();
	const { demo } = useEdition();
	const active = computed(() => demo.shows(route.path));
	return {
		active,
		signUp: demo.signUp,
		attempt: (change: () => void) => (active.value ? demo.signUp() : change()),
	};
}
