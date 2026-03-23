import type {
	BudgetRow,
	BudgetYear,
	SankeyGraphJson,
	Thh61AufwandBucketRow,
	Thh61NettoresourceRow,
	Thh61QuelleArt,
	Thh61SteuerDetailRow,
} from './budget-types.js';
import { normalizeFreiburgHaushaltLabel } from './csv-label-normalize.js';
import { getMetricsForYear } from './budget-csv.js';
import { parseEuroString } from './parse-euro.js';

function normCell(v: unknown): string {
	return String(v ?? '')
		.replace(/\u00a0/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function detectAnsatzYearCols(header: unknown[]): { y2025: number; y2026: number } | null {
	const n = header.map((c) => normCell(c).toLowerCase());
	const ansatzYear = (year: string) =>
		n.findIndex(
			(s) =>
				(s.includes('ansatz') && s.includes(year)) ||
				(/\b20/.test(s) && s.includes(year) && (s.includes('eur') || s.includes('€') || s.includes('ansatz')))
		);
	let y2025 = ansatzYear('2025');
	let y2026 = ansatzYear('2026');
	if (y2025 < 0) y2025 = n.findIndex((s) => /\b2025\b/.test(s));
	if (y2026 < 0) y2026 = n.findIndex((s) => /\b2026\b/.test(s));
	if (y2025 < 0 && y2026 < 0) return null;
	if (y2025 < 0) y2025 = y2026;
	if (y2026 < 0) y2026 = y2025;
	return { y2025, y2026 };
}

/** Excel: ASCII + Unicode-Vorzeichen in der zweiten Spalte (z. B. MINUS SIGN U+2212 statt „-“). */
function normThh61SignCell(v: unknown): string {
	const s = normCell(v);
	if (!s) return s;
	if (s === '\u2212' || s === '\u2013' || s === '\u2014' || s === '\ufe63' || s === '\uff0d') return '-';
	if (s === '\uff0b') return '+';
	if (s === '\uff1d') return '=';
	return s;
}

function coerceYearAmounts(a25: number, a26: number): { amount2025: number; amount2026: number } | null {
	let amount2025 = a25;
	let amount2026 = a26;
	if (Number.isNaN(amount2025) && !Number.isNaN(amount2026)) amount2025 = amount2026;
	if (Number.isNaN(amount2026) && !Number.isNaN(amount2025)) amount2026 = amount2025;
	if (Number.isNaN(amount2025) || Number.isNaN(amount2026)) return null;
	return { amount2025, amount2026 };
}

function rowCell(row: unknown[], i: number): unknown {
	return i >= 0 && i < row.length ? row[i] : '';
}

/** Zeile mit „Ansatz 2025/2026“-Spalten (oberhalb können Titelzeilen stehen). */
function findThh61HeaderRowIndex(matrix: unknown[][]): number {
	for (let i = 0; i < Math.min(15, matrix.length); i++) {
		if (detectAnsatzYearCols(matrix[i] as unknown[])) return i;
	}
	return 0;
}

/**
 * Freiburg-THH61: Vorzeichen (+/−/=) und Text liegen typ. in Spalten 1 und 2 — kann bei Extra-Spalten
 * oder Kopfzeilen nach vorn/hinten rutschen.
 */
type Thh61ColumnLayout = {
	headerRow: number;
	signCol: number;
	labelCol: number;
	y2025Idx: number;
	y2026Idx: number;
};

function detectThh61ColumnLayout(matrix: unknown[][]): Thh61ColumnLayout | null {
	if (!matrix?.length) return null;
	const headerRow = findThh61HeaderRowIndex(matrix);
	const header = matrix[headerRow] as unknown[];
	const ansatzCols = detectAnsatzYearCols(header);
	if (!ansatzCols) return null;

	const dataEnd = Math.min(matrix.length, headerRow + 80);
	let maxC = header.length;
	for (let r = headerRow + 1; r < dataEnd; r++) {
		maxC = Math.max(maxC, (matrix[r] as unknown[]).length);
	}
	const searchCols = Math.min(maxC, 16);

	let bestSign = 1;
	let bestScore = -1;
	for (let c = 0; c < searchCols; c++) {
		let score = 0;
		for (let r = headerRow + 1; r < dataEnd; r++) {
			const sig = normThh61SignCell(rowCell(matrix[r] as unknown[], c));
			if (sig === '+' || sig === '-' || sig === '=') score += 3;
		}
		if (score > bestScore) {
			bestScore = score;
			bestSign = c;
		}
	}

	const labelScore = (signCol: number, labelCol: number) => {
		let n = 0;
		for (let r = headerRow + 1; r < dataEnd; r++) {
			const row = matrix[r] as unknown[];
			const sig = normThh61SignCell(rowCell(row, signCol));
			if (sig !== '+' && sig !== '-' && sig !== '=') continue;
			const lab = normCell(rowCell(row, labelCol));
			if (lab.length >= 6) n++;
		}
		return n;
	};

	let labelCol = Math.min(bestSign + 1, Math.max(0, maxC - 1));
	if (bestSign + 1 < maxC) {
		const s1 = labelScore(bestSign, bestSign + 1);
		const s2 =
			bestSign + 2 < maxC ? labelScore(bestSign, bestSign + 2) : 0;
		if (s2 > s1 + 1) labelCol = bestSign + 2;
	}

	// Zu wenig Treffer: klassisches Layout (Nr. | +/− | Text | …)
	if (bestScore < 6) {
		bestSign = 1;
		labelCol = 2;
	}

	return {
		headerRow,
		signCol: bestSign,
		labelCol,
		y2025Idx: ansatzCols.y2025,
		y2026Idx: ansatzCols.y2026,
	};
}

/** Erste Datenzeile unterhalb der Summe „Anteilige ordentliche Erträge“ (=) — darunter stehen die −-Aufwandsposten. */
function findThh61AufwandStartRow(matrix: unknown[][], layout: Thh61ColumnLayout): number {
	const { headerRow, signCol, labelCol } = layout;
	for (let i = headerRow + 1; i < matrix.length; i++) {
		const row = matrix[i] as unknown[];
		const sig = normThh61SignCell(rowCell(row, signCol));
		const lab = normCell(rowCell(row, labelCol));
		if (sig === '=' && /anteilige\s+ordentliche\s+ertr/i.test(lab)) {
			return i + 1;
		}
	}
	return headerRow + 1;
}

function parseAmount(cell: unknown): number {
	if (typeof cell === 'number' && Number.isFinite(cell)) return cell;
	return parseEuroString(String(cell));
}

/** THH61: Abschnitt „Zinsen …“ / „Sonstige ordentliche Erträge“ oft ohne Unterzeilen — Ansatz steht in der +-Zeile. */
const SYNTH_KONTO_ZINSEN = '80100000';
const SYNTH_KONTO_SONST_ORD_ERTR = '80200000';

function matchThh61PlusErtragQuelle(c1: string, c2: string): Thh61QuelleArt | null {
	if (c1 !== '+') return null;
	if (/steuern/i.test(c2) && (/abgaben/i.test(c2) || /ähnlich/i.test(c2))) return 'steuern';
	if (/zuweisungen\s+und\s+zuwendungen/i.test(c2) && /umlagen/i.test(c2)) return 'zuweisungen';
	if (/^zinsen\s+und\s+ähnliche\s+ertr/i.test(c2)) return 'zinsen';
	if (/^sonstige\s+ordentliche\s+ertr/i.test(c2)) return 'sonstigeOrdentliche';
	return null;
}

const ZUWENDUNG_KONTO_H3 = new Set([
	'311',
	'312',
	'313',
	'314',
	'315',
	'316',
	'317',
	'318',
	'319',
]);

/**
 * Liest Ertragsquellen aus THH61: „Steuern und ähnliche Abgaben“, „Zuweisungen und Zuwendungen, Umlagen“
 * (jeweils Zeilen mit 8-stelligem Konto), sowie „Zinsen und ähnliche Erträge“ und
 * „Sonstige ordentliche Erträge“ (Abschnittssumme aus der Kopfzeile, falls keine Unterzeilen).
 */
export function parseThh61SteuerDetailRows(matrix: unknown[][]): Thh61SteuerDetailRow[] {
	if (!matrix?.length) return [];
	const layout = detectThh61ColumnLayout(matrix);
	if (!layout) return [];
	const { headerRow, signCol, labelCol, y2025Idx, y2026Idx } = layout;

	const out: Thh61SteuerDetailRow[] = [];

	function parseKontoDetailBlock(
		startI: number,
		quelleArt: Thh61QuelleArt
	): { nextI: number; rows: Thh61SteuerDetailRow[] } {
		const rows: Thh61SteuerDetailRow[] = [];
		let j = startI;
		while (j < matrix.length) {
			const r = matrix[j] as unknown[];
			const s1 = normThh61SignCell(rowCell(r, signCol));
			if (s1 === '+' || s1 === '-' || s1 === '=') break;
			const text = normCell(rowCell(r, labelCol));
			const m = text.match(/^(\d{8})\s+(.+)$/);
			if (m) {
				const label = text;
				const displayLabel = normalizeFreiburgHaushaltLabel(m[2].trim());
				const coerced = coerceYearAmounts(
					parseAmount(rowCell(r, y2025Idx)),
					parseAmount(rowCell(r, y2026Idx))
				);
				if (coerced) {
					rows.push({ label, displayLabel, ...coerced, quelleArt });
				}
			}
			j++;
		}
		return { nextI: j, rows };
	}

	function syntheticFromHeaderRow(
		headerRowData: unknown[],
		konto: string,
		quelleArt: Thh61QuelleArt
	): Thh61SteuerDetailRow | null {
		const title = normalizeFreiburgHaushaltLabel(normCell(rowCell(headerRowData, labelCol)));
		if (!title) return null;
		const coerced = coerceYearAmounts(
			parseAmount(rowCell(headerRowData, y2025Idx)),
			parseAmount(rowCell(headerRowData, y2026Idx))
		);
		if (!coerced) return null;
		return {
			label: `${konto} ${title}`,
			displayLabel: title,
			...coerced,
			quelleArt,
		};
	}

	let i = headerRow + 1;
	while (i < matrix.length) {
		const row = matrix[i] as unknown[];
		const c1 = normThh61SignCell(rowCell(row, signCol));
		const c2 = normCell(rowCell(row, labelCol));
		const quelleArt = matchThh61PlusErtragQuelle(c1, c2);
		if (!quelleArt) {
			i++;
			continue;
		}

		const zinsenSection = quelleArt === 'zinsen';
		const sonstOrdSection = quelleArt === 'sonstigeOrdentliche';

		const { nextI, rows: details } = parseKontoDetailBlock(i + 1, quelleArt);

		if (details.length > 0) {
			out.push(...details);
		} else if (zinsenSection) {
			const s = syntheticFromHeaderRow(row, SYNTH_KONTO_ZINSEN, 'zinsen');
			if (s) out.push(s);
		} else if (sonstOrdSection) {
			const s = syntheticFromHeaderRow(row, SYNTH_KONTO_SONST_ORD_ERTR, 'sonstigeOrdentliche');
			if (s) out.push(s);
		}

		i = nextI;
	}
	return out;
}

/**
 * Ordentliche Aufwendungsrubriken aus THH61 (Spalte „−“): Abschnittszeilen und ggf. darunterliegende Konten.
 * Summenzeilen mit „=“ werden nicht als „−“-Block erfasst.
 */
export function parseThh61AufwandBucketRows(matrix: unknown[][]): Thh61AufwandBucketRow[] {
	if (!matrix?.length) return [];
	const layout = detectThh61ColumnLayout(matrix);
	if (!layout) return [];
	const { headerRow, signCol, labelCol, y2025Idx, y2026Idx } = layout;

	const out: Thh61AufwandBucketRow[] = [];

	function parseAufwandKontoBlock(startI: number): { nextI: number; rows: Thh61AufwandBucketRow[] } {
		const rows: Thh61AufwandBucketRow[] = [];
		let j = startI;
		while (j < matrix.length) {
			const r = matrix[j] as unknown[];
			const s1 = normThh61SignCell(rowCell(r, signCol));
			if (s1 === '+' || s1 === '-' || s1 === '=') break;
			const text = normCell(rowCell(r, labelCol));
			const m = text.match(/^(\d{8})\s+(.+)$/);
			if (m) {
				const label = text;
				const displayLabel = normalizeFreiburgHaushaltLabel(m[2].trim());
				const coerced = coerceYearAmounts(
					parseAmount(rowCell(r, y2025Idx)),
					parseAmount(rowCell(r, y2026Idx))
				);
				if (coerced) {
					rows.push({ label, displayLabel, ...coerced });
				}
			}
			j++;
		}
		return { nextI: j, rows };
	}

	let i = findThh61AufwandStartRow(matrix, layout);
	while (i < matrix.length) {
		const row = matrix[i] as unknown[];
		const c1 = normThh61SignCell(rowCell(row, signCol));
		const c2 = normCell(rowCell(row, labelCol));
		if (c1 !== '-') {
			i++;
			continue;
		}
		if (/^anteilige\s+ordentliche\s+aufwendungen/i.test(c2)) {
			i++;
			continue;
		}

		const title = normalizeFreiburgHaushaltLabel(c2);
		if (!title) {
			i++;
			continue;
		}

		const { nextI, rows: details } = parseAufwandKontoBlock(i + 1);
		if (details.length > 0) {
			out.push(...details);
		} else {
			const coerced = coerceYearAmounts(
				parseAmount(rowCell(row, y2025Idx)),
				parseAmount(rowCell(row, y2026Idx))
			);
			if (coerced) {
				out.push({
					label: `AUFW|${title}`,
					displayLabel: title,
					...coerced,
				});
			}
		}
		i = nextI;
	}
	return out;
}

const NETTORESSOURCE_ROW_RE =
	/veranschlagt.*nettoressource|nettoressource.*veranschlagt|nettoressourcenbedarf/i;

const NETTORESSOURCE_SANKEY_LABEL = 'Veranschlagte Nettoresource';
const NETTORESSOURCE_NODE_ID = 'N:NETTORESSOURCE';

/**
 * Summenzeile „=“ mit Nettoressource (z. B. Veranschlagter Nettoressourcenbedarf/überschuss).
 */
export function parseThh61NettoresourceRow(matrix: unknown[][]): Thh61NettoresourceRow | null {
	if (!matrix?.length) return null;
	const layout = detectThh61ColumnLayout(matrix);
	if (!layout) return null;
	const { headerRow, signCol, labelCol, y2025Idx, y2026Idx } = layout;

	for (let i = headerRow + 1; i < matrix.length; i++) {
		const row = matrix[i] as unknown[];
		if (normThh61SignCell(rowCell(row, signCol)) !== '=') continue;
		const raw = normCell(rowCell(row, labelCol));
		if (!NETTORESSOURCE_ROW_RE.test(raw)) continue;
		const coerced = coerceYearAmounts(
			parseAmount(rowCell(row, y2025Idx)),
			parseAmount(rowCell(row, y2026Idx))
		);
		if (!coerced) return null;
		return {
			label: raw,
			displayLabel: normalizeFreiburgHaushaltLabel(raw) || NETTORESSOURCE_SANKEY_LABEL,
			...coerced,
		};
	}
	return null;
}

function steuerAmount(r: Thh61SteuerDetailRow, year: BudgetYear): number {
	return year === 2025 ? r.amount2025 : r.amount2026;
}

/**
 * Zuordnung Sankey-Zwischenebene: 302/305 = Steueranteile & Ausgleiche; 311–319 = typ. Zuweisungen/Umlagen;
 * 801/802 = Zinsen / sonstige ordentliche Erträge (im Pool-Sankey ohne „Kommunale Steuern“-Knoten).
 */
export type Thh61SteuerEbene = 'kommunal' | 'bundLand';

export function classifyThh61SteuerEbene(r: Thh61SteuerDetailRow): Thh61SteuerEbene {
	const m = r.label.match(/^(\d{8})\s/);
	if (!m) return 'kommunal';
	const konto = m[1];
	const h3 = konto.slice(0, 3);
	if (konto.startsWith('801') || konto.startsWith('802')) return 'kommunal';
	if (h3 === '302' || h3 === '305') return 'bundLand';
	if (ZUWENDUNG_KONTO_H3.has(h3)) return 'bundLand';
	return 'kommunal';
}

/** Zinsen / sonstige ordentliche Erträge: im Steuertopf-Sankey direkt in den Topf, nicht über „Kommunale Steuern“. */
function flowsDirectToSteuertopf(r: Thh61SteuerDetailRow): boolean {
	if (r.quelleArt === 'zinsen' || r.quelleArt === 'sonstigeOrdentliche') return true;
	const m = r.label.match(/^(\d{8})\s/);
	if (!m) return false;
	const konto = m[1];
	return konto.startsWith('801') || konto.startsWith('802');
}

/**
 * Sankey-Spalte 0 (nur Quellen über Kommunal/Bund): zuerst kommunale Steuern, dann Bund & Land,
 * jeweils alphabetisch. Zinsen/sonstige Erträge werden im Steuertopf-Graphen separat in Spalte 1 geführt.
 */
function sortThh61RowsForSankey(rows: Thh61SteuerDetailRow[]): Thh61SteuerDetailRow[] {
	return [...rows].sort((a, b) => {
		const ka = classifyThh61SteuerEbene(a) === 'kommunal' ? 0 : 1;
		const kb = classifyThh61SteuerEbene(b) === 'kommunal' ? 0 : 1;
		if (ka !== kb) return ka - kb;
		return a.displayLabel.localeCompare(b.displayLabel, 'de');
	});
}

const EBENE_KOMMUNAL_ID = 'E:KOMMUNAL';
const EBENE_BUND_LAND_ID = 'E:BUNDLAND';
const POOL_NODE_ID = 'P:STEUERTOPF';

/**
 * Sankey: Ertragsquellen (THH_61) → Dezernat.
 *
 * Verteilung: modellhaft proportional zur Summe der positiven Erträge je Dezernat
 * im Ergebnishaushalt-CSV (gesamtstädtisch). Es liegt keine buchhalterische
 * Zuordnung Einzelsteuer → Dezernat vor.
 */
export function buildSankeySteuerDezernatGraph(
	rows: BudgetRow[],
	steuerRows: Thh61SteuerDetailRow[],
	year: BudgetYear
): SankeyGraphJson {
	const steuerFiltered = sortThh61RowsForSankey(
		steuerRows.filter((r) => steuerAmount(r, year) > 0)
	);
	if (steuerFiltered.length === 0) return { nodes: [], links: [] };

	const dezErtrag = new Map<string, number>();
	for (const row of rows) {
		const m = getMetricsForYear(row, year);
		const e = Math.max(m.ertraege, 0);
		if (e <= 0) continue;
		const d = normalizeFreiburgHaushaltLabel(row.dezernatsbezeichnung);
		if (!d) continue;
		dezErtrag.set(d, (dezErtrag.get(d) ?? 0) + e);
	}

	const totalE = [...dezErtrag.values()].reduce((a, b) => a + b, 0);
	if (totalE <= 0) return { nodes: [], links: [] };

	const nodes: SankeyGraphJson['nodes'] = [];
	const index = new Map<string, number>();

	for (const s of steuerFiltered) {
		const id = `S:${s.label}`;
		index.set(id, nodes.length);
		nodes.push({ id, label: s.displayLabel, column: 0 });
	}

	const dezSorted = [...dezErtrag.keys()].sort((a, b) => a.localeCompare(b, 'de'));
	for (const d of dezSorted) {
		const id = `D:${d}`;
		index.set(id, nodes.length);
		nodes.push({ id, label: d, column: 1 });
	}

	const links: SankeyGraphJson['links'] = [];
	for (const s of steuerFiltered) {
		const A = steuerAmount(s, year);
		const si = index.get(`S:${s.label}`);
		if (si === undefined) continue;
		for (const [dez, e] of dezErtrag) {
			const v = A * (e / totalE);
			if (v <= 0) continue;
			const ti = index.get(`D:${dez}`);
			if (ti === undefined) continue;
			links.push({ source: si, target: ti, value: v });
		}
	}

	return { nodes, links };
}

/**
 * Vierstufiges Sankey: Ertragsquelle (THH_61) → Kommunal / Zuweisungen → THH61 Erträge → THH61-Aufwand.
 *
 * Einstufung nach THH61-Sachkonto: 302/305 → Bund & Land; 311–319 → Bund & Land; Zinsen und
 * sonstige ordentliche Erträge (801/802 bzw. quelleArt) stehen in derselben Sankey-Spalte wie die
 * Aggregate Kommunal/Bund und fließen direkt in den Topf-Knoten; übrige Quellen → Spalte 0 → kommunale Steuern.
 *
 * Topf → Aufwand: Kantenwerte = Summe der |Ansätze| je Rubrik aus `parseThh61AufwandBucketRows`
 * (Blatt THH61, „−“-Abschnitte). Zusätzlich Abfluss „Veranschlagte Nettoresource“ aus der „=“-Zeile
 * Nettoressourcenbedarf/überschuss (positiver Ansatz → Abgang in den Gesamthaushalt).
 */
export function buildSankeySteuerPoolThh61AufwandGraph(
	steuerRows: Thh61SteuerDetailRow[],
	aufwandBuckets: Thh61AufwandBucketRow[],
	year: BudgetYear,
	nettoresourceRow: Thh61NettoresourceRow | null = null
): SankeyGraphJson {
	const positive = steuerRows.filter((r) => steuerAmount(r, year) > 0);
	if (positive.length === 0) return { nodes: [], links: [] };

	const viaMitte = sortThh61RowsForSankey(positive.filter((r) => !flowsDirectToSteuertopf(r)));
	const directTopf = [...positive.filter((r) => flowsDirectToSteuertopf(r))].sort((a, b) =>
		a.displayLabel.localeCompare(b.displayLabel, 'de')
	);
	const steuerFiltered = [...viaMitte, ...directTopf];

	const aufwandByLabel = new Map<string, number>();
	for (const b of aufwandBuckets) {
		const v = Math.abs(year === 2025 ? b.amount2025 : b.amount2026);
		if (v <= 0) continue;
		const lab = normalizeFreiburgHaushaltLabel(b.displayLabel) || '—';
		aufwandByLabel.set(lab, (aufwandByLabel.get(lab) ?? 0) + v);
	}

	const totalAuf = [...aufwandByLabel.values()].reduce((a, x) => a + x, 0);
	const nrRaw = nettoresourceRow
		? year === 2025
			? nettoresourceRow.amount2025
			: nettoresourceRow.amount2026
		: 0;
	const nrFlow = Math.abs(nrRaw);
	if (totalAuf <= 0 && nrFlow <= 0) return { nodes: [], links: [] };

	const totalSteuer = steuerFiltered.reduce((s, r) => s + steuerAmount(r, year), 0);
	if (totalSteuer <= 0) return { nodes: [], links: [] };

	let sumKommunal = 0;
	let sumBundLand = 0;
	for (const r of viaMitte) {
		const a = steuerAmount(r, year);
		if (classifyThh61SteuerEbene(r) === 'bundLand') sumBundLand += a;
		else sumKommunal += a;
	}

	const nodes: SankeyGraphJson['nodes'] = [];
	const index = new Map<string, number>();

	for (const r of viaMitte) {
		const id = `S:${r.label}`;
		index.set(id, nodes.length);
		nodes.push({ id, label: r.displayLabel, column: 0 });
	}

	let ekIdx: number | undefined;
	if (sumKommunal > 0) {
		ekIdx = nodes.length;
		index.set(EBENE_KOMMUNAL_ID, ekIdx);
		nodes.push({
			id: EBENE_KOMMUNAL_ID,
			label: 'Kommunale Steuern',
			column: 1,
		});
	}

	let ebIdx: number | undefined;
	if (sumBundLand > 0) {
		ebIdx = nodes.length;
		index.set(EBENE_BUND_LAND_ID, ebIdx);
		nodes.push({
			id: EBENE_BUND_LAND_ID,
			label: 'Zuweisungen',
			column: 1,
		});
	}

	for (const r of directTopf) {
		const id = `S:${r.label}`;
		index.set(id, nodes.length);
		nodes.push({ id, label: r.displayLabel, column: 1 });
	}

	const poolIdx = nodes.length;
	index.set(POOL_NODE_ID, poolIdx);
	nodes.push({
		id: POOL_NODE_ID,
		label: 'THH61 Erträge',
		column: 2,
	});

	const aufwandSorted = [...aufwandByLabel.keys()].sort((a, b) => a.localeCompare(b, 'de'));
	for (const b of aufwandSorted) {
		const id = `A:${b}`;
		index.set(id, nodes.length);
		nodes.push({ id, label: b, column: 3 });
	}

	let nettoIdx: number | undefined;
	if (nrFlow > 0) {
		nettoIdx = nodes.length;
		index.set(NETTORESSOURCE_NODE_ID, nettoIdx);
		nodes.push({
			id: NETTORESSOURCE_NODE_ID,
			label: NETTORESSOURCE_SANKEY_LABEL,
			column: 3,
		});
	}

	const links: SankeyGraphJson['links'] = [];

	for (const r of viaMitte) {
		const si = index.get(`S:${r.label}`);
		if (si === undefined) continue;
		const amt = steuerAmount(r, year);
		const isBund = classifyThh61SteuerEbene(r) === 'bundLand';
		const ti = isBund ? ebIdx : ekIdx;
		if (ti === undefined) continue;
		links.push({ source: si, target: ti, value: amt });
	}

	for (const r of directTopf) {
		const si = index.get(`S:${r.label}`);
		if (si === undefined) continue;
		links.push({ source: si, target: poolIdx, value: steuerAmount(r, year) });
	}

	if (sumKommunal > 0 && ekIdx !== undefined) {
		links.push({ source: ekIdx, target: poolIdx, value: sumKommunal });
	}
	if (sumBundLand > 0 && ebIdx !== undefined) {
		links.push({ source: ebIdx, target: poolIdx, value: sumBundLand });
	}

	for (const [b, auf] of aufwandByLabel) {
		if (auf <= 0) continue;
		const ti = index.get(`A:${b}`);
		if (ti === undefined) continue;
		links.push({ source: poolIdx, target: ti, value: auf });
	}

	if (nrFlow > 0 && nettoIdx !== undefined) {
		links.push({ source: poolIdx, target: nettoIdx, value: nrFlow });
	}

	return { nodes, links };
}
