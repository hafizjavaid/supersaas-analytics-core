export function isPlainLeftClick(event: MouseEvent) {
	return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
