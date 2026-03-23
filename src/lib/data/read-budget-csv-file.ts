import { readFileSync } from 'node:fs';
import { parseBudgetCsv } from './budget-csv.js';
import type { BudgetRow } from './budget-types.js';
import { repairFreiburgBrokenUmlautCsvText } from './csv-freiburg-repair.js';

/**
 * Liest eine Ergebnishaushalt-CSV: UTF-8, optional BOM am Dateianfang entfernen,
 * danach Freiburg-spezifische `?`-Platzhalter für Umlaute/ß reparieren.
 */
export function readBudgetCsvFile(absolutePath: string): BudgetRow[] {
	const buf = readFileSync(absolutePath);
	let start = 0;
	if (buf.length >= 3 && buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf) {
		start = 3;
	}
	const raw = buf.subarray(start).toString('utf8');
	const text = repairFreiburgBrokenUmlautCsvText(raw);
	return parseBudgetCsv(text);
}
