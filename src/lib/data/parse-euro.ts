/**
 * Parses Freiburg CSV currency cells into a number.
 * Handles mixed German / US formatting, optional €, spaces, NBSP, and sign.
 */
export function parseEuroString(raw: string | undefined | null): number {
	if (raw == null) return NaN;
	let s = String(raw).trim();
	if (!s) return NaN;
	if (s === '–' || s === '-' || s === '—') return 0;

	s = s.replace(/\u00a0/g, '').replace(/\s+/g, '');
	s = s.replace(/€/g, '');

	let negative = false;
	if (s.startsWith('(') && s.endsWith(')')) {
		negative = true;
		s = s.slice(1, -1).trim();
	}
	if (s.startsWith('+')) s = s.slice(1);
	if (s.startsWith('-')) {
		negative = !negative;
		s = s.slice(1);
	}

	const hasComma = s.includes(',');
	const hasDot = s.includes('.');

	if (hasComma && hasDot) {
		// German: 1.234,56 or 1.234,567 (thousands dots, decimal comma)
		const lastComma = s.lastIndexOf(',');
		const intPart = s.slice(0, lastComma).replace(/\./g, '');
		const fracPart = s.slice(lastComma + 1);
		s = `${intPart}.${fracPart}`;
	} else if (hasComma && !hasDot) {
		const parts = s.split(',');
		if (parts.length === 2 && /^\d+$/.test(parts[0]) && /^\d+$/.test(parts[1])) {
			// Decimal comma if fractional part looks like decimals (1–3 digits typical in data)
			if (parts[1].length <= 3) {
				s = `${parts[0]}.${parts[1]}`;
			} else {
				s = parts.join('');
			}
		} else {
			s = s.replace(/,/g, '');
		}
	} else if (hasDot && !hasComma) {
		const parts = s.split('.');
		if (parts.length > 2) {
			// Repeated dots → thousands (e.g. 1.234.567.89 ambiguous); treat all but last as thousands
			const frac = parts[parts.length - 1];
			if (frac.length <= 2) {
				s = `${parts.slice(0, -1).join('')}.${frac}`;
			} else {
				s = parts.join('');
			}
		}
	}

	const n = Number(s);
	if (Number.isNaN(n)) return NaN;
	return negative ? -n : n;
}
