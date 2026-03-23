import type { BudgetRow, BudgetYear } from './budget-types.js';
import { getMetricsForYear } from './budget-csv.js';
import type { ThhArtLine, ThhIntegrityItem } from './thh-types.js';

function officialTotalForThh(lines: ThhArtLine[], thhId: string, year: BudgetYear): number | null {
	const subset = lines.filter((l) => l.thhId === thhId && l.isOfficialTotal);
	if (subset.length === 0) return null;
	const v = year === 2025 ? subset[0].amount2025 : subset[0].amount2026;
	return Math.abs(v);
}

/**
 * Summe der Absolutbeträge der Aufwendungen aller Produktzeilen zum Teilhaushalt.
 */
export function sumProductAufwendungenAbsForThh(
	rows: BudgetRow[],
	thhId: string,
	year: BudgetYear
): number {
	const id = thhId.trim().toUpperCase();
	let s = 0;
	for (const r of rows) {
		if (r.teilhaushalte.trim().toUpperCase() !== id) continue;
		const m = getMetricsForYear(r, year);
		s += Math.abs(m.aufwendungen);
	}
	return s;
}

export function buildThhIntegrityReport(
	productRows: BudgetRow[],
	thhLines: ThhArtLine[]
): ThhIntegrityItem[] {
	const thhIds = [...new Set(thhLines.map((l) => l.thhId))].sort();
	const years: BudgetYear[] = [2025, 2026];
	const out: ThhIntegrityItem[] = [];

	for (const thhId of thhIds) {
		const official2025 = officialTotalForThh(thhLines, thhId, 2025);
		const official2026 = officialTotalForThh(thhLines, thhId, 2026);

		for (const year of years) {
			const totalOfficialAbs = year === 2025 ? official2025 : official2026;
			if (totalOfficialAbs == null || totalOfficialAbs === 0) continue;

			const sumProductsAbs = sumProductAufwendungenAbsForThh(productRows, thhId, year);
			const deviationPct =
				(Math.abs(sumProductsAbs - totalOfficialAbs) / Math.max(totalOfficialAbs, 1e-9)) * 100;

			out.push({
				thhId,
				year,
				sumProductsAbs,
				totalOfficialAbs,
				deviationPct,
				exceedsOnePercent: deviationPct > 1,
			});
		}
	}
	return out;
}
