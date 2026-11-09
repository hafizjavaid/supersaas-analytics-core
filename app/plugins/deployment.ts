import type { DeploymentStatus } from "#layers/core/shared/types/deployment";

export default defineNuxtPlugin(async () => {
	const status = useState<DeploymentStatus | null>("deployment", () => null);
	status.value ??= await useRequestFetch()<DeploymentStatus>("/api/deployment");
});
