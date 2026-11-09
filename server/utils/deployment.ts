import type { DeploymentOverrides, DeploymentStatus } from "#layers/core/shared/types/deployment";

let overrides: DeploymentOverrides = {};

// Dev only: lets the server tests see one server with closed sign-up, or without email or Google.
export function overrideDeployment(deploymentOverrides: DeploymentOverrides) {
	overrides = deploymentOverrides;
}

export function signUpPolicy() {
	return overrides.signUps ?? serverEdition().signUps();
}

export function hasEmail() {
	return overrides.email ?? (serverEdition().assumesEmail || isEmailConfigured());
}

export function hasGoogleSearchConsole() {
	return overrides.googleSearchConsole ?? isGoogleConfigured();
}

export async function deploymentStatus(): Promise<DeploymentStatus> {
	return {
		ai: Boolean(useRuntimeConfig().anthropic.apiKey),
		signUpOpen: await isSignUpOpen(),
		email: hasEmail(),
		googleSearchConsole: hasGoogleSearchConsole(),
	};
}
