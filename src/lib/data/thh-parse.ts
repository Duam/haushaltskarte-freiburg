import Papa from 'papaparse';
import { normalizeFreiburgHaushaltLabel } from './csv-label-normalize.js';
import { parseEuroString } from './parse-euro.js';
import type { ThhArtLine } from './thh-types.js';

const OFFICIAL_TOTAL_RE = /^\s*anteilige\s+ordentliche\s+aufwendungen/i;

function normCell(v: unknown): string {
	return String(v ?? '')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function normHeader(h: string): string {
	return normCell(h).toLowerCase();
}

/** Erkennt Spalten flexibel (CSV-Export / Excel-Header). */
export function detectThhColumns(headers: string[]): {
	thhIdx: number;
	labelIdx: number;
	y2025Idx: number;
	y2026Idx: number;
	/** Freiburg-Mappe: Spalte mit + / − / = vor der Bezeichnung */
	signIdx?: number;
} | null {
	const n = headers.map(normHeader);
	const idx = (pred: (s: string, i: number) => boolean) => n.findIndex(pred);
	const nrLike = (s: string) => s === 'nr' || s === 'nr.' || s === 'no.' || s === 'no';

	/* Freiburg „Teilhaushalte 20xx“-XLSX: Nr., (+/−), Ertrags- und Aufwandsarten, …, Ansatz 2025/2026 */
	if (nrLike(n[0] ?? '')) {
		const secondHdr = n[1] ?? '';
		const signIdx =
			secondHdr === '' || secondHdr === '+' || secondHdr === '-' || secondHdr === '=' ? 1 : undefined;

		let labelIdx = idx(
			(s) =>
				(s.includes('ertrag') && s.includes('aufwand')) || s.includes('ertrags- und aufwandsarten')
		);
		if (labelIdx < 0) {
			labelIdx = idx(
				(s) =>
					s.includes('artengliederung') ||
					s.includes('bezeichnung') ||
					s.includes('kategorie') ||
					s === 'art' ||
					s.includes('position')
			);
		}
		if (labelIdx < 0) return null;

		let y2025Idx = idx(
			(s) =>
				s === 'ansatz_2025' ||
				(s.includes('ansatz') && s.includes('2025')) ||
				s.endsWith('_25') ||
				/\b2025\b/.test(s)
		);
		let y2026Idx = idx(
			(s) =>
				s === 'ansatz_2026' ||
				(s.includes('ansatz') && s.includes('2026')) ||
				s.endsWith('_26') ||
				/\b2026\b/.test(s)
		);

		if (y2025Idx < 0 && y2026Idx >= 0) y2025Idx = y2026Idx;
		if (y2026Idx < 0 && y2025Idx >= 0) y2026Idx = y2025Idx;
		if (y2025Idx < 0) return null;

		return { thhIdx: -1, labelIdx, y2025Idx, y2026Idx, signIdx };
	}

	let thhIdx = idx(
		(s) =>
			s === 'thh_id' ||
			s.includes('teilhaushalt') ||
			/^thh[_\s-]?\d*/.test(s) ||
			s === 'thh' ||
			s.startsWith('thh_')
	);
	if (thhIdx < 0) thhIdx = 0;

	let labelIdx = idx(
		(s) =>
			s.includes('artengliederung') ||
			s.includes('bezeichnung') ||
			s.includes('kategorie') ||
			s === 'art' ||
			s.includes('position')
	);
	if (labelIdx < 0) return null;
	if (labelIdx === thhIdx) labelIdx = thhIdx === 0 ? 1 : 0;

	if (thhIdx >= 0 && nrLike(n[thhIdx] ?? '')) thhIdx = -1;

	let y2025Idx = idx(
		(s) =>
			s === 'ansatz_2025' ||
			s.includes('2025') ||
			s.includes('ansatz 2025') ||
			s.endsWith('_25')
	);
	let y2026Idx = idx(
		(s) =>
			s === 'ansatz_2026' ||
			s.includes('2026') ||
			s.includes('ansatz 2026') ||
			s.endsWith('_26')
	);

	if (y2025Idx < 0 && y2026Idx >= 0) y2025Idx = y2026Idx;
	if (y2026Idx < 0 && y2025Idx >= 0) y2026Idx = y2025Idx;

	if (y2025Idx < 0) return null;

	return { thhIdx, labelIdx, y2025Idx, y2026Idx };
}

export function parseThhRowsAsObjects(
	rows: Record<string, unknown>[],
	source: string,
	fallbackThhId?: string
): { lines: ThhArtLine[]; errors: string[] } {
	const errors: string[] = [];
	if (rows.length === 0) {
		errors.push(`${source}: keine Datenzeilen`);
		return { lines: [], errors };
	}

	const headers = Object.keys(rows[0] ?? {}).map(normCell);
	const idx = detectThhColumns(headers);
	if (!idx) {
		errors.push(`${source}: Spalten nicht erkannt (erwartet u. a. Bezeichnung + 2025/2026)`);
		return { lines: [], errors };
	}

	if (idx.thhIdx < 0 && !fallbackThhId) {
		errors.push(
			`${source}: Layout mit „Nr.“-Spalte — Teilhaushalt muss aus dem Blattnamen (z. B. THH01) kommen.`
		);
		return { lines: [], errors };
	}

	const lines: ThhArtLine[] = [];
	for (let r = 0; r < rows.length; r++) {
		const row = rows[r];
		const cells = headers.map((h) => normCell(row[h]));
		const thhFromCell = idx.thhIdx >= 0 ? cells[idx.thhIdx].replace(/\s+/g, '').toUpperCase() : '';
		const thhId = (thhFromCell || fallbackThhId || '').replace(/\s+/g, '').toUpperCase();
		const label = normalizeFreiburgHaushaltLabel(cells[idx.labelIdx]);
		if (!thhId || !label) continue;

		const sign =
			idx.signIdx !== undefined && idx.signIdx >= 0 ? normCell(cells[idx.signIdx] ?? '') : '';
		const includeInExpenseSankey = idx.signIdx === undefined ? true : sign === '-';

		const v25 = parseEuroString(cells[idx.y2025Idx]);
		const v26 = parseEuroString(cells[idx.y2026Idx] ?? cells[idx.y2025Idx]);

		if (Number.isNaN(v25) && Number.isNaN(v26)) continue;

		lines.push({
			thhId,
			label,
			amount2025: Number.isNaN(v25) ? 0 : v25,
			amount2026: Number.isNaN(v26) ? 0 : v26,
			isOfficialTotal: OFFICIAL_TOTAL_RE.test(label),
			includeInExpenseSankey,
		});
	}

	return { lines, errors };
}

export function parseThhCsvText(text: string, source: string, fallbackThhId?: string) {
	const parsed = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: false,
	});
	return parseThhRowsAsObjects(parsed.data as Record<string, unknown>[], source, fallbackThhId);
}

/** Tabellenblatt als Objektzeilen (erste Zeile = Header). */
export function parseThhSheetMatrix(matrix: unknown[][], source: string, fallbackThhId?: string) {
	if (!matrix.length) return { lines: [] as ThhArtLine[], errors: [`${source}: leer`] };
	const headers = (matrix[0] as unknown[]).map((c) => normCell(c));
	const objects: Record<string, unknown>[] = [];
	for (let i = 1; i < matrix.length; i++) {
		const row = matrix[i] as unknown[];
		const o: Record<string, unknown> = {};
		for (let j = 0; j < headers.length; j++) {
			o[headers[j]] = row[j];
		}
		objects.push(o);
	}
	return parseThhRowsAsObjects(objects, source, fallbackThhId);
}

export function mergeThhLines(into: ThhArtLine[], more: ThhArtLine[]) {
	const key = (l: ThhArtLine) => `${l.thhId}::${l.label}::${l.isOfficialTotal}`;
	const map = new Map<string, ThhArtLine>();
	for (const l of into) map.set(key(l), l);
	for (const l of more) map.set(key(l), l);
	return [...map.values()];
}
