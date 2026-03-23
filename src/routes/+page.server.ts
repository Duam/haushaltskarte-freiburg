import { join } from 'node:path';
import {
	buildTeilhaushaltDisplayLabels,
	listDezernate,
} from '$lib/data/budget-csv.js';
import { readBudgetCsvFile } from '$lib/data/read-budget-csv-file.js';
import { buildThhIntegrityReport } from '$lib/data/thh-integrity.js';
import {
	parseThh61AufwandBucketRows,
	parseThh61NettoresourceRow,
	parseThh61SteuerDetailRows,
} from '$lib/data/thh61-steuer.js';
import { loadTeilhaushalteXlsx } from '$lib/server/load-thh-data.js';
import type { PageServerLoad } from './$types';

const MAIN_CSV =
	'de-bw-freiburg-ergebnishaushalt_ordentliche_ertraegeaufwendungen_ohne_aktivierte_eigenleistungen_doppelhaushalt_20252026.csv';

export const load: PageServerLoad = async () => {
	const root = process.cwd();
	const mainPath = join(root, 'data', MAIN_CSV);
	const rows = readBudgetCsvFile(mainPath);
	const dezernate = listDezernate(rows);

	const { bundle: thhBundle, thh61Matrix, thh61SheetFound } = loadTeilhaushalteXlsx(join(root, 'data'));
	const thh61SteuerLines = parseThh61SteuerDetailRows(thh61Matrix ?? []);
	const thh61AufwandBuckets = parseThh61AufwandBucketRows(thh61Matrix ?? []);
	const thh61Nettoresource = parseThh61NettoresourceRow(thh61Matrix ?? []);
	const thhDisplayLabels = Object.fromEntries(buildTeilhaushaltDisplayLabels(rows));
	const thhIntegrity = buildThhIntegrityReport(rows, thhBundle.lines);

	return {
		rows,
		dezernate,
		thhBundle,
		thh61SteuerLines,
		thh61AufwandBuckets,
		thh61Nettoresource,
		thh61SheetFound,
		thhDisplayLabels,
		thhIntegrity,
	};
};
