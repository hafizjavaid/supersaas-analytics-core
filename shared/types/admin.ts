export interface AdminUser {
	id: string;
	name: string;
	email: string;
	emailVerified: boolean;
	role: string | null;
	createdAt: number;
	organizations: number;
}

export interface AdminUserList {
	users: AdminUser[];
	total: number;
}

export interface AdminOrganization extends OrganizationExtras {
	id: string;
	name: string;
	slug: string;
	createdAt: number;
	ownerEmail: string | null;
	members: number;
	sites: number;
}

export interface DatabaseSize {
	sizeBytes: number;
	limitBytes: number;
	alertBytes: number;
	alert: boolean;
}
