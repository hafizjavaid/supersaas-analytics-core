export interface OrganizationMembership extends OrganizationExtras {
	id: string;
	name: string;
	slug: string;
	logo: string | null;
	createdAt: string;
	memberId: string;
	role: string;
}

export interface OrganizationMember {
	id: string;
	userId: string;
	role: string;
	createdAt: string;
	name: string;
	email: string;
	image: string | null;
}

export interface PendingInvitation {
	id: string;
	email: string;
	role: string | null;
	expiresAt: string;
}

export interface OrganizationMembers {
	members: OrganizationMember[];
	invitations: PendingInvitation[];
}
