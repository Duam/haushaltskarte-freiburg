import Papa from 'papaparse';
import type {
	BudgetRow,
	BudgetYear,
	SankeyGraphJson,
	TreemapDatum,
	WaterfallStep,
	YearMetrics,
} from './budget-types.js';
import type { ThhArtLine } from './thh-types.js';
import { normalizeFreiburgHaushaltLabel } from './csv-label-normalize.js';
import { parseEuroString } from './parse-euro.js';

const COL = {
	teilhaushalte: 'Teilhaushalte',
	teilhaushalteBezeichnung: 'Teilhaushalte Bezeichnung',
	dezernatsbezeichnung: 'Dezernatsbezeichnung',
	produktbereichBezeichnung: 'Produktbereich Bezeichnung',
	produktgruppenbezeichnung: 'Produktgruppenbezeichnung',
	produktbezeichnung: 'Produktbezeichnung',
	produkt: 'Produkt',
	dezernat: 'Dezernat',
	e25: 'Ansatz 2025 (Erträge)',
	a25: 'Ansatz 2025 (Aufwendungen)',
	s25: 'Ansatz 2025 (Saldo/Zuschussbedarf/Erträge - Aufwendungen)',
	e26: 'Ansatz 2026 (Erträge)',
	a26: 'Ansatz 2026 (Aufwendungen)',
	s26: 'Ansatz 2026 (Saldo/Zuschussbedarf/Erträge - Aufwendungen)',
} as const;

function trimLabel(v: unknown): string {
	return normalizeFreiburgHaushaltLabel(v);
}

function rowMetrics(
	e: string | undefined,
	a: string | undefined,
	s: string | undefined
): YearMetrics {
	return {
		ertraege: parseEuroString(e),
		aufwendungen: parseEuroString(a),
		saldo: parseEuroString(s),
	};
}

export function parseBudgetCsv(text: string): BudgetRow[] {
	const parsed = Papa.parse<Record<string, string>>(text, {
		header: true,
		skipEmptyLines: 'greedy',
		dynamicTyping: false,
	});

	const rows: BudgetRow[] = [];
	for (const r of parsed.data) {
		const dezernatsbezeichnung = trimLabel(r[COL.dezernatsbezeichnung]);
		if (!dezernatsbezeichnung) continue;

		rows.push({
			dezernat: trimLabel(r[COL.dezernat]),
			teilhaushalte: trimLabel(r[COL.teilhaushalte]),
			teilhaushalteBezeichnung: trimLabel(r[COL.teilhaushalteBezeichnung]),
			dezernatsbezeichnung,
			produktbereichBezeichnung: trimLabel(r[COL.produktbereichBezeichnung]),
			produktgruppenbezeichnung: trimLabel(r[COL.produktgruppenbezeichnung]),
			produktbezeichnung: trimLabel(r[COL.produktbezeichnung]),
			produkt: trimLabel(r[COL.produkt]),
			metrics2025: rowMetrics(r[COL.e25], r[COL.a25], r[COL.s25]),
			metrics2026: rowMetrics(r[COL.e26], r[COL.a26], r[COL.s26]),
		});
	}
	return rows;
}

export function getMetricsForYear(row: BudgetRow, year: BudgetYear): YearMetrics {
	return year === 2025 ? row.metrics2025 : row.metrics2026;
}

/** Filter rows by Produktbezeichnung (case-insensitive). */
export function filterByProductSearch(rows: BudgetRow[], query: string): BudgetRow[] {
	const q = query.trim().toLowerCase();
	if (!q) return rows;
	return rows.filter((r) => r.produktbezeichnung.toLowerCase().includes(q));
}

/** Alle eindeutigen Produktbezeichnungen (sortiert, de-DE). */
export function listUniqueProductBezeichnungen(rows: BudgetRow[]): string[] {
	const set = new Set<string>();
	for (const r of rows) {
		const p = r.produktbezeichnung?.trim();
		if (p) set.add(p);
	}
	return [...set].sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
}

/**
 * Vorschläge für die Suche: zuerst Treffer am Wortanfang, dann sonstige Teilstrings.
 */
export function suggestProductBezeichnungen(
	allLabels: string[],
	query: string,
	limit = 14
): string[] {
	const q = query.trim().toLowerCase();
	if (!q) return [];

	const starts: string[] = [];
	const rest: string[] = [];
	for (const label of allLabels) {
		const low = label.toLowerCase();
		if (!low.includes(q)) continue;
		if (low.startsWith(q)) starts.push(label);
		else rest.push(label);
	}
	starts.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
	rest.sort((a, b) => a.localeCompare(b, 'de', { sensitivity: 'base' }));
	return [...starts, ...rest].slice(0, limit);
}

function ensureChild(parent: TreemapDatum, name: string): TreemapDatum {
	if (!parent.children) parent.children = [];
	let ch = parent.children.find((c) => c.name === name);
	if (!ch) {
		ch = { name };
		parent.children.push(ch);
	}
	return ch;
}

/**
 * Hierarchie: Stadt → Dezernat → Produktbereich → Produktgruppe → Produkt (Blatt).
 * Blattwert = |Aufwendungen| für Treemap-Fläche.
 */
export function buildTreemapRoot(rows: BudgetRow[], year: BudgetYear): TreemapDatum {
	const root: TreemapDatum = { name: 'Stadt Freiburg', children: [] };

	for (const row of rows) {
		const m = getMetricsForYear(row, year);
		const absAuf = Math.abs(m.aufwendungen);
		const dez = ensureChild(root, row.dezernatsbezeichnung);
		const bereich = ensureChild(dez, row.produktbereichBezeichnung || '—');
		const gruppe = ensureChild(bereich, row.produktgruppenbezeichnung || '—');
		const leafName = row.produktbezeichnung || row.produkt || '—';
		if (!gruppe.children) gruppe.children = [];
		gruppe.children.push({
			name: leafName,
			value: absAuf,
			meta: {
				ertraege: m.ertraege,
				aufwendungen: m.aufwendungen,
				saldo: m.saldo,
				produkt: row.produkt,
			},
		});
	}
	return root;
}

/** Sankey: Dezernat → Produktbereich, Kantenstärke = Summe |Aufwendungen|. */
export function buildSankeyGraph(rows: BudgetRow[], year: BudgetYear): SankeyGraphJson {
	type AggKey = `${string}|||${string}`;
	const agg = new Map<AggKey, number>();

	for (const row of rows) {
		const m = getMetricsForYear(row, year);
		const v = Math.abs(m.aufwendungen);
		if (v === 0) continue;
		const left = normalizeFreiburgHaushaltLabel(row.dezernatsbezeichnung);
		const right = normalizeFreiburgHaushaltLabel(row.produktbereichBezeichnung || '—');
		const key = `${left}|||${right}` as AggKey;
		agg.set(key, (agg.get(key) ?? 0) + v);
	}

	const leftIds = new Set<string>();
	const rightIds = new Set<string>();
	for (const k of agg.keys()) {
		const [l, r] = k.split('|||');
		leftIds.add(l);
		rightIds.add(r);
	}

	const nodes: SankeyGraphJson['nodes'] = [];
	const index = new Map<string, number>();

	for (const id of leftIds) {
		index.set(`L:${id}`, nodes.length);
		nodes.push({ id: `L:${id}`, label: id, column: 0 });
	}
	for (const id of rightIds) {
		index.set(`R:${id}`, nodes.length);
		nodes.push({ id: `R:${id}`, label: id, column: 1 });
	}

	const links: SankeyGraphJson['links'] = [];
	for (const [k, value] of agg) {
		const [l, r] = k.split('|||');
		const si = index.get(`L:${l}`);
		const ti = index.get(`R:${r}`);
		if (si === undefined || ti === undefined) continue;
		links.push({ source: si, target: ti, value });
	}

	return { nodes, links };
}

export function listDezernate(rows: BudgetRow[]): string[] {
	const s = new Set<string>();
	for (const r of rows) s.add(r.dezernatsbezeichnung);
	return [...s].sort((a, b) => a.localeCompare(b, 'de'));
}

/**
 * Waterfall für ein Dezernat: Erträge (+), Aufwendungen (−), Saldo (Ende).
 * Balken sind „schwebend“ zwischen kumulierten Stufen.
 */
export function buildWaterfallSteps(
	rows: BudgetRow[],
	year: BudgetYear,
	dezernatsbezeichnung: string
): WaterfallStep[] {
	const subset = rows.filter((r) => r.dezernatsbezeichnung === dezernatsbezeichnung);
	let sumE = 0;
	let sumA = 0;
	let sumS = 0;
	for (const r of subset) {
		const m = getMetricsForYear(r, year);
		sumE += m.ertraege;
		sumA += m.aufwendungen;
		sumS += m.saldo;
	}
	// Plausibilität: Saldo sollte Erträge + Aufwendungen sein (Toleranz wegen Rundung)
	const saldo = Math.abs(sumS - (sumE + sumA)) < 1 ? sumS : sumE + sumA;

	const steps: WaterfallStep[] = [];
	let run = 0;

	steps.push({
		key: 'e',
		label: 'Erträge',
		value: sumE,
		start: run,
		end: run + sumE,
		kind: sumE >= 0 ? 'positive' : 'negative',
	});
	run += sumE;

	steps.push({
		key: 'a',
		label: 'Aufwendungen',
		value: sumA,
		start: run,
		end: run + sumA,
		kind: sumA >= 0 ? 'positive' : 'negative',
	});

	run += sumA;

	steps.push({
		key: 's',
		label: 'Saldo',
		value: saldo,
		start: 0,
		end: saldo,
		kind: saldo >= 0 ? 'positive' : 'negative',
	});

	return steps;
}

/** Anzeige-Label je Teilhaushalt-ID (erste Zeile im Produkt-CSV). */
export function buildTeilhaushaltDisplayLabels(rows: BudgetRow[]): Map<string, string> {
	const m = new Map<string, string>();
	for (const r of rows) {
		const id = r.teilhaushalte.trim().toUpperCase();
		if (!id || m.has(id)) continue;
		const bez = normalizeFreiburgHaushaltLabel(r.teilhaushalteBezeichnung);
		m.set(id, bez ? `${id} — ${bez}` : id);
	}
	return m;
}

/**
 * Summe der Kantenwerte, die in Knoten einer bestimmten Spalte einlaufen
 * (z. B. THH61: Spalte 2 „THH61 Erträge“; THH-Aufwand: Spalte 1 Aufwendungsarten).
 */
export function totalSankeyInflowToColumn(graph: SankeyGraphJson, column: number): number {
	let t = 0;
	for (const l of graph.links) {
		const ti = typeof l.target === 'number' ? l.target : -1;
		if (ti < 0 || ti >= graph.nodes.length) continue;
		if (graph.nodes[ti].column === column) t += l.value;
	}
	return t;
}

/**
 * Sankey: Teilhaushalt → Aufwendungsart (THH-Artengliederung).
 * Aggregiert |Betrag| je Kante; Soll-Summenzeile („Anteilige ordentliche Aufwendungen“) wird ausgelassen.
 */
export function buildSankeyThhExpenseGraph(
	lines: ThhArtLine[],
	year: BudgetYear,
	displayByThh: Map<string, string>
): SankeyGraphJson {
	type AggKey = `${string}|||${string}`;
	const agg = new Map<AggKey, number>();

	for (const l of lines) {
		if (l.isOfficialTotal || !l.includeInExpenseSankey) continue;
		const amt = year === 2025 ? l.amount2025 : l.amount2026;
		const v = Math.abs(amt);
		if (v === 0) continue;
		const left = normalizeFreiburgHaushaltLabel(displayByThh.get(l.thhId) ?? l.thhId);
		const right = normalizeFreiburgHaushaltLabel(l.label) || '—';
		const key = `${left}|||${right}` as AggKey;
		agg.set(key, (agg.get(key) ?? 0) + v);
	}

	const leftIds = new Set<string>();
	const rightIds = new Set<string>();
	for (const k of agg.keys()) {
		const [le, ri] = k.split('|||');
		leftIds.add(le);
		rightIds.add(ri);
	}

	const nodes: SankeyGraphJson['nodes'] = [];
	const index = new Map<string, number>();

	for (const id of leftIds) {
		index.set(`L:${id}`, nodes.length);
		nodes.push({ id: `L:${id}`, label: id, column: 0 });
	}
	for (const id of rightIds) {
		index.set(`R:${id}`, nodes.length);
		nodes.push({ id: `R:${id}`, label: id, column: 1 });
	}

	const links: SankeyGraphJson['links'] = [];
	for (const [k, value] of agg) {
		const [l, r] = k.split('|||');
		const si = index.get(`L:${l}`);
		const ti = index.get(`R:${r}`);
		if (si === undefined || ti === undefined) continue;
		links.push({ source: si, target: ti, value });
	}

	return { nodes, links };
}
