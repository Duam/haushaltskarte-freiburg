import { join } from 'node:path';
import {
	parseThh61AufwandBucketRows,
	parseThh61NettoresourceRow,
	parseThh61SteuerDetailRows,
} from '$lib/data/thh61-steuer.js';
import { loadTeilhaushalteXlsx } from '$lib/server/load-thh-data.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const root = process.cwd();
	const { thh61Matrix, thh61SheetFound } = loadTeilhaushalteXlsx(join(root, 'data'));
	const thh61SteuerLines = parseThh61SteuerDetailRows(thh61Matrix ?? []);
	const thh61AufwandBuckets = parseThh61AufwandBucketRows(thh61Matrix ?? []);
	const thh61Nettoresource = parseThh61NettoresourceRow(thh61Matrix ?? []);

	return {
		thh61SteuerLines,
		thh61AufwandBuckets,
		thh61Nettoresource,
		thh61SheetFound,
	};
};
