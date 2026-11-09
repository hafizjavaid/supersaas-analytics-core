import { describe, expect, it } from "vitest";
import { isPlainLeftClick } from "#layers/core/app/utils/link-click";

function click(init: Partial<MouseEvent> = {}) {
	return { button: 0, ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, ...init } as MouseEvent;
}

describe("isPlainLeftClick", () => {
	it("accepts a left click without modifiers", () => {
		expect(isPlainLeftClick(click())).toBe(true);
	});

	it("leaves ctrl, cmd, shift and alt clicks to the browser", () => {
		expect(isPlainLeftClick(click({ ctrlKey: true }))).toBe(false);
		expect(isPlainLeftClick(click({ metaKey: true }))).toBe(false);
		expect(isPlainLeftClick(click({ shiftKey: true }))).toBe(false);
		expect(isPlainLeftClick(click({ altKey: true }))).toBe(false);
	});

	it("leaves a middle click to the browser", () => {
		expect(isPlainLeftClick(click({ button: 1 }))).toBe(false);
	});
});
