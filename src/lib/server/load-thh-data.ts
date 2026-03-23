import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import * as XLSX from 'xlsx';
import { mergeThhLines, parseThhSheetMatrix } from '$lib/data/thh-parse.js';
import { TEILHAUSHALTE_WORKBOOK_FILENAME } from '$lib/data/teilhaushalte-workbook.js';
import type { ThhArtLine, ThhBundle } from '$lib/data/thh-types.js';

/**
 * Blatt mit der städtischen Steuer-/Ertragsaufschlüsselung (THH61).
 * Zuerst exakt `THH61`, sonst z. B. `THH61_2` bei Excel-Duplikaten (falls vorhanden).
 */
export function findThh61SteuerSheetName(sheetNames: string[]): string | undefined {
	const trim = (s: string) => s.trim();
	const isVariant = (name: string) => {
		const t = trim(name);
		const u = t.toUpperCase();
		if (u === 'THH61') return true;
		if (/^THH61[._]\d+$/i.test(t)) return true;
		if (/^THH61\s*\(\d+\)\s*$/i.test(t)) return true;
		return false;
	};
	const exact = sheetNames.find((n) => trim(n).toUpperCase() === 'THH61');
	if (exact) return exact;
	return sheetNames.find(isVariant);
}

/** Blattnamen wie `THH01`, `THH22_FEHLT` → `THH_01` / `THH_22` (wie Haushalts-CSV). */
export function normalizeFreiburgThhIdFromSheetName(sheetName: string): string | undefined {
	const base = sheetName.trim().split('_')[0];
	const m = base.match(/^THH(\d+)$/i);
	if (!m) return undefined;
	const n = parseInt(m[1], 10);
	return `THH_${String(n).padStart(2, '0')}`;
}

export type TeilhaushalteXlsxResult = {
	bundle: ThhBundle;
	/** Rohmatrix Blatt THH61 (Ertragsquellen / Steueraufschlüsselung), sonst null */
	thh61Matrix: unknown[][] | null;
	/** Ob ein THH61-Blatt in der Mappe gefunden wurde (auch wenn die Matrix leer ist) */
	thh61SheetFound: boolean;
};

/**
 * Liest `data/Teilhaushalte 2025 und 2026.xlsx` einmal:
 * alle THH-Blätter → Bundle; zusätzlich Matrix von THH61.
 */
export function loadTeilhaushalteXlsx(dataDir: string): TeilhaushalteXlsxResult {
	const path = join(dataDir, TEILHAUSHALTE_WORKBOOK_FILENAME);
	const errors: string[] = [];
	const sources: string[] = [];
	let all: ThhArtLine[] = [];
	let thh61Matrix: unknown[][] | null = null;
	let thh61SheetFound = false;

	if (!existsSync(path)) {
		return {
			bundle: {
				lines: [],
				sources: [],
				errors: [
					`Datei fehlt: data/${TEILHAUSHALTE_WORKBOOK_FILENAME} — bitte dort ablegen.`,
				],
			},
			thh61Matrix: null,
			thh61SheetFound: false,
		};
	}

	try {
		const buf = readFileSync(path);
		const wb = XLSX.read(buf, { type: 'buffer', cellDates: false });
		sources.push(TEILHAUSHALTE_WORKBOOK_FILENAME);

		if (!wb.SheetNames.length) {
			errors.push(`${TEILHAUSHALTE_WORKBOOK_FILENAME}: keine Arbeitsblätter`);
			return {
				bundle: { lines: [], sources, errors },
				thh61Matrix: null,
				thh61SheetFound: false,
			};
		}

		const thh61Name = findThh61SteuerSheetName(wb.SheetNames);
		if (thh61Name) {
			thh61SheetFound = true;
			const sh = wb.Sheets[thh61Name];
			if (sh) {
				thh61Matrix = XLSX.utils.sheet_to_json(sh, { header: 1, defval: '' }) as unknown[][];
			}
		}

		for (const sheetName of wb.SheetNames) {
			if (/^thh_map$/i.test(sheetName.trim())) continue;

			const sheetFallback = normalizeFreiburgThhIdFromSheetName(sheetName);
			if (!sheetFallback) continue;
			const sheet = wb.Sheets[sheetName];
			if (!sheet) continue;
			const matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
			const label = `${TEILHAUSHALTE_WORKBOOK_FILENAME}#${sheetName}`;
			const { lines, errors: e } = parseThhSheetMatrix(matrix, label, sheetFallback);
			errors.push(...e);
			all = mergeThhLines(all, lines);
		}
	} catch (err) {
		errors.push(err instanceof Error ? err.message : String(err));
	}

	return { bundle: { lines: all, sources, errors }, thh61Matrix, thh61SheetFound };
}

/** @deprecated Nutze loadTeilhaushalteXlsx für THH61-Zugriff */
export function loadThhTeilhaushalteWorkbook(dataDir: string): ThhBundle {
	return loadTeilhaushalteXlsx(dataDir).bundle;
}
