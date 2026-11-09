import { describe, expect, it } from "vitest";
import { approachAngle, globeAnglesFor, sameCoordinates } from "#layers/core/app/utils/globe";

describe("globeAnglesFor", () => {
	it("turns the prime meridian on the equator to face the viewer", () => {
		expect(globeAnglesFor({ latitude: 0, longitude: 0 })).toEqual({ phi: -Math.PI / 2, theta: 0 });
	});

	it("turns further east by a smaller phi and tilts by the latitude", () => {
		const { phi, theta } = globeAnglesFor({ latitude: 45, longitude: 90 });
		expect(phi).toBeCloseTo(-Math.PI);
		expect(theta).toBeCloseTo(Math.PI / 4);
	});
});

describe("approachAngle", () => {
	it("moves the given fraction of the way to the target", () => {
		expect(approachAngle(0, 1, 0.5)).toBeCloseTo(0.5);
	});

	it("takes the shorter way round a full turn", () => {
		expect(approachAngle(0.1, 2 * Math.PI - 0.1, 1)).toBeCloseTo(-0.1);
		expect(approachAngle(10 * Math.PI, 0.2, 1)).toBeCloseTo(10 * Math.PI + 0.2);
	});
});

describe("sameCoordinates", () => {
	it("matches equal coordinates only", () => {
		expect(sameCoordinates({ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 2 })).toBe(true);
		expect(sameCoordinates({ latitude: 1, longitude: 2 }, { latitude: 1, longitude: 3 })).toBe(false);
		expect(sameCoordinates(null, { latitude: 1, longitude: 2 })).toBe(false);
	});
});
