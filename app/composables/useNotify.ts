export function useNotify() {
	const toast = useToast();
	const demo = useDemo();

	function success(title: string, description?: string) {
		toast.add({ title, description, color: "success", icon: "i-material-symbols-check-circle-outline-rounded" });
	}

	// Whatever fails in the demo is a change or a request outside its recordings, both of which sign-up answers.
	function error(title: string, caught: unknown, fallback?: string) {
		if (demo.active.value) {
			demo.signUp();
			return;
		}
		toast.add({ title, description: describeError(caught, fallback), color: "error", icon: "i-material-symbols-error-outline-rounded" });
	}

	return { success, error };
}
