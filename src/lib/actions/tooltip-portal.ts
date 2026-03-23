import type { Action } from 'svelte/action';

const PORTAL_ID = 'sankey-tooltip-portal';

function ensurePortalRoot(): HTMLElement {
	let el = document.getElementById(PORTAL_ID);
	if (!el) {
		el = document.createElement('div');
		el.id = PORTAL_ID;
		el.className = 'pointer-events-none fixed inset-0 z-[1000]';
		el.setAttribute('aria-hidden', 'true');
		document.body.appendChild(el);
	}
	return el;
}

/**
 * Hängt den Knoten an `document.body`, damit er nicht von einem Vorfahren-`transform` mit skaliert wird
 * (z. B. Karten-Zoom).
 */
export const tooltipPortal: Action<HTMLElement, undefined> = (node) => {
	const root = ensurePortalRoot();
	root.appendChild(node);
	return {
		destroy() {
			if (node.parentNode === root) root.removeChild(node);
		},
	};
};
