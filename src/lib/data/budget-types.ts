export type BudgetYear = 2025 | 2026;

export type YearMetrics = {
	ertraege: number;
	aufwendungen: number;
	saldo: number;
};

/** One CSV line after cleaning; includes metrics for both Haushaltsjahre. */
export type BudgetRow = {
	dezernat: string;
	/** z. B. THH_01 — Verknüpfung mit THH-Wirtschaftsdateien */
	teilhaushalte: string;
	teilhaushalteBezeichnung: string;
	dezernatsbezeichnung: string;
	produktbereichBezeichnung: string;
	produktgruppenbezeichnung: string;
	produktbezeichnung: string;
	produkt: string;
	metrics2025: YearMetrics;
	metrics2026: YearMetrics;
};

export type TreemapDatum = {
	name: string;
	children?: TreemapDatum[];
	/** Leaf: Absolutbetrag Aufwendungen (für Fläche). */
	value?: number;
	/** Leaf: Metadaten für Tooltip/Farbe */
	meta?: {
		ertraege: number;
		aufwendungen: number;
		saldo: number;
		produkt: string;
	};
};

export type SankeyGraphJson = {
	nodes: { id: string; label: string; column: number }[];
	links: { source: number; target: number; value: number }[];
};

/** THH61-Abschnitt der Ertragszeile (für Sankey-Beschriftung). */
export type Thh61QuelleArt =
	| 'steuern'
	| 'zuweisungen'
	| 'zinsen'
	| 'sonstigeOrdentliche';

/**
 * Ertragszeilen aus THH61 (Teilhaushalte-XLSX): Steuern, Zuweisungen/Umlagen, ggf. Zinsen und
 * sonstige ordentliche Erträge (Abschnittssumme, wenn keine Unterzeilen).
 */
export type Thh61SteuerDetailRow = {
	/** Rohbezeichnung inkl. Kontonummer */
	label: string;
	/** Kurztext ohne führende 8-stellige Nummer */
	displayLabel: string;
	amount2025: number;
	amount2026: number;
	/** Beim Parsen gesetzt (THH61-Abschnitt). */
	quelleArt?: Thh61QuelleArt;
};

/** Rubriken unter „−“ im THH61-Blatt (ordentliche Aufwendungen), ggf. mit 8-stelligen Unterkonten. */
export type Thh61AufwandBucketRow = {
	label: string;
	displayLabel: string;
	amount2025: number;
	amount2026: number;
};

/**
 * Zeile „=“ im THH61-Blatt, z. B. „Veranschlagter Nettoressourcenbedarf/überschuss“
 * (positiver Überschuss fließt in den Gesamthaushalt).
 */
export type Thh61NettoresourceRow = {
	/** Rohtext aus der Mappe */
	label: string;
	displayLabel: string;
	amount2025: number;
	amount2026: number;
};

export type WaterfallStep = {
	key: string;
	label: string;
	value: number;
	start: number;
	end: number;
	kind: 'positive' | 'negative';
};
