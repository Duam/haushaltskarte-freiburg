import type { Action } from 'svelte/action';

/** `wheel` mit `{ passive: false }`, damit `preventDefault()` (z. B. Zoom) greift. */
export const nonPassiveWheel: Action<HTMLElement, (e: WheelEvent) => void> = (node, handler) => {
	let h = handler;
	const wrapped = (e: WheelEvent) => h(e);
	node.addEventListener('wheel', wrapped, { passive: false });
	return {
		update(newHandler) {
			h = newHandler;
		},
		destroy() {
			node.removeEventListener('wheel', wrapped);
		},
	};
};
