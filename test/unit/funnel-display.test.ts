import { describe, expect, it } from "vitest";
import { funnelEntryLine, funnelTransition, funnelWindowLabel, previewableDraft } from "#layers/core/app/utils/funnels";

describe("funnel display", () => {
	it("labels the window, the entries and each transition", () => {
		expect(funnelWindowLabel("24h")).toBe("24 hours window");
		expect(funnelEntryLine({ steps: [{}, {}] as never, enteredRate: 0.031 })).toBe("2 steps · 3.1% of all visitors entered");
		expect(funnelTransition({ continueRate: 0.144, dropped: 1793 })).toBe("↓ 14.4% continue · 1,793 dropped");
	});
});

describe("previewableDraft", () => {
	const page = (value: string) => ({ kind: "page" as const, value, label: "" });

	it("normalizes a complete draft and names an unnamed one", () => {
		expect(previewableDraft({ name: "", window: "1h", steps: [page(" /a "), { kind: "event", value: "signup", label: " Done " }] })).toEqual({
			name: "Preview",
			window: "1h",
			steps: [page("/a"), { kind: "event", value: "signup", label: "Done" }],
		});
	});

	it("skips a draft with too few steps or a half-typed one", () => {
		expect(previewableDraft({ name: "A", window: "1h", steps: [page("/a")] })).toBeNull();
		expect(previewableDraft({ name: "A", window: "1h", steps: [page("/a"), page("pricing")] })).toBeNull();
		expect(previewableDraft({ name: "A", window: "1h", steps: [page("/a"), { kind: "event", value: "", label: "" }] })).toBeNull();
	});
});
