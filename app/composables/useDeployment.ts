import type { DeploymentStatus } from "#layers/core/shared/types/deployment";

// Loaded once per visit by plugins/deployment.ts.
export function useDeployment() {
	const status = useState<DeploymentStatus>("deployment");
	return {
		ai: computed(() => status.value.ai),
		signUpOpen: computed(() => status.value.signUpOpen),
		email: computed(() => status.value.email),
	};
}
