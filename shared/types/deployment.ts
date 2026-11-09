export type SignUpPolicy = "open" | "closed";

export interface DeploymentStatus {
	ai: boolean;
	signUpOpen: boolean;
	email: boolean;
	googleSearchConsole: boolean;
}

// Dev only: what the server tests change to see a copy with closed sign-up, or without email or a Google OAuth client.
export interface DeploymentOverrides {
	signUps?: SignUpPolicy;
	email?: boolean;
	googleSearchConsole?: boolean;
}
