import type { BudgetYear } from './budget-types.js';

/** Eine Zeile der THH-Artengliederung (Wirtschaftsplan / Excel-Export). */
export type ThhArtLine = {
	thhId: string;
	/** z. B. Personalaufwendungen, Sachaufwendungen */
	label: string;
	amount2025: number;
	amount2026: number;
	/** Zeile „Anteilige ordentliche Aufwendungen“ — Referenz für Plausibilität */
	isOfficialTotal: boolean;
	/**
	 * Freiburg-Excel: nur Zeilen mit „-“ in der Vorzeichenspalte (Aufwand) im Sankey „Aufw.-Art“.
	 * Fehlt die Spalte (CSV), gilt true.
	 */
	includeInExpenseSankey: boolean;
};

export type ThhBundle = {
	/** Alle geparsten Zeilen (mehrere Dateien zusammengeführt). */
	lines: ThhArtLine[];
	/** Quelldateien (zur Nachverfolgung). */
	sources: string[];
	/** Parser-/Dateifehler (nicht-blockierend). */
	errors: string[];
};

export type ThhIntegrityItem = {
	thhId: string;
	year: BudgetYear;
	/** Summe |Aufwendungen| aller Produktzeilen im Haushalt-CSV für dieses THH */
	sumProductsAbs: number;
	/** Betrag aus THH-Datei („Anteilige ordentliche Aufwendungen“), Absolutwert */
	totalOfficialAbs: number;
	/** Abweichung in Prozent (0–100) */
	deviationPct: number;
	exceedsOnePercent: boolean;
};
