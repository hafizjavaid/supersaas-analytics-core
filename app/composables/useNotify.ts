export function useNotify() {
	const toast = useToast();

	function success(title: string, description?: string) {
		toast.add({ title, description, color: "success", icon: "i-material-symbols-check-circle-outline-rounded" });
	}

	function error(title: string, caught: unknown, fallback?: string) {
		toast.add({ title, description: describeError(caught, fallback), color: "error", icon: "i-material-symbols-error-outline-rounded" });
	}

	return { success, error };
}
