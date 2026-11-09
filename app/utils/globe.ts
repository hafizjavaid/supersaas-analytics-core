export interface Coordinates {
	latitude: number;
	longitude: number;
}

export const DEFAULT_GLOBE_THETA = 0.16;
const FULL_TURN = 2 * Math.PI;

// cobe places [lat, lng] at phi = -π/2 - lng and theta = lat (both in radians) facing the viewer.
export function globeAnglesFor({ latitude, longitude }: Coordinates) {
	return { phi: -Math.PI / 2 - (longitude * Math.PI) / 180, theta: (latitude * Math.PI) / 180 };
}

// Moves part of the way to the target along the shorter way round, so the globe never spins the long way.
export function approachAngle(current: number, target: number, fraction: number) {
	const difference = target - current;
	const shortest = difference - FULL_TURN * Math.round(difference / FULL_TURN);
	return current + shortest * fraction;
}

export function sameCoordinates(a: Coordinates | null | undefined, b: Coordinates | null | undefined) {
	return !!a && !!b && a.latitude === b.latitude && a.longitude === b.longitude;
}
