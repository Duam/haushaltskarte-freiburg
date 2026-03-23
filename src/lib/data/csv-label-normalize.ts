/**
 * Freiburg Haushaltsdaten: Teilzeilen sind mit `% ` markiert; vereinzelt steht `%` ohne
 * folgendes Leerzeichen direkt vor dem Text (`%Einwohnerwesen`, `%Restaufgaben`).
 */
export function normalizeFreiburgHaushaltLabel(v: unknown): string {
	let t = String(v ?? '')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();

	for (;;) {
		const next = t.replace(/^\s*% /, '').trimStart();
		if (next === t) break;
		t = next;
	}

	for (;;) {
		const next = t.replace(/^%(?=\S)/u, '').trimStart();
		if (next === t) break;
		t = next;
	}

	return t;
}
