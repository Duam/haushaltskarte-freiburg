<script lang="ts">
	import BudgetSankey from '$lib/charts/BudgetSankey.svelte';
	import BudgetTreemap from '$lib/charts/BudgetTreemap.svelte';
	import DezernatWaterfall from '$lib/charts/DezernatWaterfall.svelte';
	import * as Card from '$lib/components/ui/card/index.js';
	import ProductSearchCombobox from '$lib/components/ProductSearchCombobox.svelte';
	import * as Select from '$lib/components/ui/select/index.js';
	import * as Tabs from '$lib/components/ui/tabs/index.js';
	import type { BudgetYear } from '$lib/data/budget-types.js';
	import { TEILHAUSHALTE_WORKBOOK_FILENAME } from '$lib/data/teilhaushalte-workbook.js';
	import {
		buildSankeyGraph,
		buildSankeyThhExpenseGraph,
		buildTreemapRoot,
		buildWaterfallSteps,
		filterByProductSearch,
		totalSankeyInflowToColumn,
	} from '$lib/data/budget-csv.js';
	import {
		buildSankeySteuerDezernatGraph,
		buildSankeySteuerPoolThh61AufwandGraph,
	} from '$lib/data/thh61-steuer.js';

	/** Drei exemplarische Teilhaushalte unter dem THH61-Gesamt-Sankey */
	const EXEMPLAR_THH_IDS = ['THH_02', 'THH_17', 'THH_08'] as const;

	let { data } = $props();

	let yearTab = $state('2025');
	let search = $state('');
	let selectedDez = $state('');
	/** Sankey: Produktbereiche, THH, Steuern→Dezernat oder Steuern→Topf→Bereich */
	let sankeyView = $state<'product' | 'expense' | 'steuern' | 'steuernPool'>('product');

	$effect(() => {
		if (!selectedDez && data.dezernate[0]) selectedDez = data.dezernate[0];
		else if (selectedDez && !data.dezernate.includes(selectedDez) && data.dezernate[0]) {
			selectedDez = data.dezernate[0];
		}
	});

	const year = $derived((yearTab === '2026' ? 2026 : 2025) as BudgetYear);

	const filteredRows = $derived(filterByProductSearch(data.rows, search));

	const treemapRoot = $derived(buildTreemapRoot(filteredRows, year));

	const thhLabelMap = $derived(new Map(Object.entries(data.thhDisplayLabels ?? {})));

	const allowedThhIds = $derived(
		new Set(
			filteredRows
				.map((r) => r.teilhaushalte.trim().toUpperCase())
				.filter(Boolean)
		)
	);

	const thhLinesFiltered = $derived(
		(data.thhBundle?.lines ?? []).filter((l) => allowedThhIds.has(l.thhId.toUpperCase()))
	);

	const sankeyGraphProduct = $derived(buildSankeyGraph(filteredRows, year));

	const sankeyGraphExpense = $derived(
		buildSankeyThhExpenseGraph(thhLinesFiltered, year, thhLabelMap)
	);

	const sankeyGraphSteuern = $derived(
		buildSankeySteuerDezernatGraph(data.rows, data.thh61SteuerLines ?? [], year)
	);

	const sankeyGraphSteuernPool = $derived(
		buildSankeySteuerPoolThh61AufwandGraph(
			data.thh61SteuerLines ?? [],
			data.thh61AufwandBuckets ?? [],
			year,
			data.thh61Nettoresource ?? null
		)
	);

	const exemplarThhSankeyGraphs = $derived.by(() => {
		const lines = data.thhBundle?.lines ?? [];
		const map = thhLabelMap;
		const refInflow = totalSankeyInflowToColumn(sankeyGraphSteuernPool, 2);
		return EXEMPLAR_THH_IDS.map((id) => {
			const idU = id.toUpperCase();
			const graph = buildSankeyThhExpenseGraph(
				lines.filter((l) => l.thhId.toUpperCase() === idU),
				year,
				map
			);
			return { id: idU, title: map.get(idU) ?? idU, graph };
		})
			.filter((x) => x.graph.links.length > 0)
			.map((ex) => {
				const inf = totalSankeyInflowToColumn(ex.graph, 1);
				const layoutFlowScale = refInflow > 0 && inf > 0 ? refInflow / inf : 1;
				return { ...ex, layoutFlowScale };
			});
	});

	const sankeyGraph = $derived(
		sankeyView === 'product'
			? sankeyGraphProduct
			: sankeyView === 'expense'
				? sankeyGraphExpense
				: sankeyView === 'steuern'
					? sankeyGraphSteuern
					: sankeyGraphSteuernPool
	);

	const thhIntegrityWarnings = $derived(
		(data.thhIntegrity ?? []).filter((x) => x.exceedsOnePercent)
	);

	/** Nur wenn THH61-Zeilen da sind, der Graph aber leer bleibt (z. B. kein positives Jahr oder kein Aufwand). */
	const thh61SteuerPoolEmptyReason = $derived.by(() => {
		const sl = data.thh61SteuerLines ?? [];
		const bk = data.thh61AufwandBuckets ?? [];
		const nr = data.thh61Nettoresource;
		const y = year;
		const pos = sl.filter((r) => (y === 2025 ? r.amount2025 : r.amount2026) > 0);
		if (pos.length === 0) {
			return `Keine positiven THH61-Ertrags-Ansätze für ${y}. Prüfe die +-Rubriken und die Spalten „Ansatz ${y} …“ im Blatt THH61.`;
		}
		let totalAuf = 0;
		for (const b of bk) {
			totalAuf += Math.abs(y === 2025 ? b.amount2025 : b.amount2026);
		}
		const nrAmt = nr ? Math.abs(y === 2025 ? nr.amount2025 : nr.amount2026) : 0;
		if (totalAuf <= 0 && nrAmt <= 0) {
			return `Keine auswertbaren Abflüsse für ${y}: weder Aufwand-Rubriken („−“) noch Zeile „Veranschlagte Nettoresource“ (=) im Blatt THH61.`;
		}
		return 'THH61-Gesamt-Sankey konnte nicht aufgebaut werden.';
	});

	const waterfallSteps = $derived(buildWaterfallSteps(data.rows, year, selectedDez));
</script>

<svelte:head>
	<title>Haushalt Dashboard — Stadt Freiburg</title>
	<meta
		name="description"
		content="Interaktive Übersicht: Ergebnishaushalt Freiburg (ordentliche Erträge und Aufwendungen)."
	/>
</svelte:head>

<div class="bg-muted/30 min-h-screen">
	<div class="mx-auto max-w-7xl space-y-8 px-4 py-10 md:px-6">
		<header class="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
			<div>
				<h1 class="text-foreground text-2xl font-semibold tracking-tight md:text-3xl">
					Freiburg — Ergebnishaushalt
				</h1>
				<p class="text-muted-foreground mt-1 max-w-2xl text-sm leading-relaxed">
					Visualisierung der Ansätze 2025/2026 (ordentliche Erträge und Aufwendungen). Flächen im
					Treemap: Betrag der Aufwendungen (Absolutwert). Farben: Saldo pro Produkt — grün positiv,
					rot negativ.
				</p>
			</div>
			<Tabs.Root bind:value={yearTab} class="w-full max-w-xs shrink-0">
				<Tabs.List
					variant="line"
					class="bg-background/80 grid w-full grid-cols-2 rounded-lg border p-1 shadow-sm"
				>
					<Tabs.Trigger value="2025">2025</Tabs.Trigger>
					<Tabs.Trigger value="2026">2026</Tabs.Trigger>
				</Tabs.List>
			</Tabs.Root>
		</header>

		<Card.Root class="shadow-sm">
			<Card.Header>
				<Card.Title>Global Overview</Card.Title>
				<Card.Description>
					Treemap nach Hierarchie Dezernat → Produktbereich → Produktgruppe → Produkt. Größe =
					|Aufwendungen|.
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<ProductSearchCombobox
					rows={data.rows}
					bind:value={search}
					id="treemap-product-search"
					placeholder="z. B. Bürgerservice, Straßenreinigung…"
				/>
				{#if filteredRows.length === 0}
					<p class="text-muted-foreground text-sm">
						Keine Zeilen passen zur Suche — Treemap ausgeblendet.
					</p>
				{:else}
					<BudgetTreemap root={treemapRoot} />
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="shadow-sm">
			<Card.Header class="space-y-3">
				<div>
					<Card.Title>Budget Flow</Card.Title>
					<Card.Description>
						{#if sankeyView === 'product'}
							Sankey von Dezernat zu Produktbereich — Kantenstärke: Summe |Aufwendungen| ({year}).
						{:else if sankeyView === 'expense'}
							Sankey von Teilhaushalt (THH) zu Aufwendungsarten (Artengliederung aus THH-Dateien,
							ohne Soll-Summenzeile) — {year}.
						{:else if sankeyView === 'steuern'}
							Ertragsquellen aus THH_61 (Steuern, Zuweisungen/Umlagen, Zinsen, sonstige ordentliche Erträge
							aus Teilhaushalte-XLSX) → Verteilung auf Dezernate.
							<strong class="text-foreground font-medium">Modell:</strong> proportional zur Summe der
							positiven Erträge je Dezernat im Ergebnishaushalt (gesamtstädtisch, unabhängig vom
							Produktfilter oben) — {year}.
						{:else}
							Vierstufig: Ertragsquellen (THH_61) → <strong class="text-foreground font-medium"
								>Kommunal / Zuweisungen</strong
							>
							(nach THH61-Konten) → <strong class="text-foreground font-medium">THH61 Erträge</strong>
							→ <strong class="text-foreground font-medium">Aufwand</strong> (Spalte „−“) und
							<strong class="text-foreground font-medium">Veranschlagte Nettoresource</strong> (=, aus
							den Erträgen in den Gesamthaushalt). Kantenstärken = |Ansätze| aus der Datei —
							{year}.
						{/if}
					</Card.Description>
				</div>
				<Tabs.Root bind:value={sankeyView} class="w-full max-w-4xl">
					<Tabs.List
						variant="line"
						class="bg-background/80 grid w-full grid-cols-1 gap-1 rounded-lg border p-1 shadow-sm sm:grid-cols-2 xl:grid-cols-4"
					>
						<Tabs.Trigger value="product">Aufwand → Bereich</Tabs.Trigger>
						<Tabs.Trigger value="expense">THH-Aufwand</Tabs.Trigger>
						<Tabs.Trigger value="steuern">Steuern → Dezernat</Tabs.Trigger>
						<Tabs.Trigger value="steuernPool">Steuern → THH61 → Aufwand</Tabs.Trigger>
					</Tabs.List>
				</Tabs.Root>
			</Card.Header>
			<Card.Content class="space-y-4">
				{#if data.thhBundle?.sources?.length}
					<p class="text-muted-foreground text-xs">
						THH-Dateien: {data.thhBundle.sources.join(', ')}
					</p>
				{/if}
				{#if data.thhBundle?.errors?.some((e) => e)}
					<p class="text-destructive text-xs">{data.thhBundle.errors.join(' · ')}</p>
				{/if}

				{#if thhIntegrityWarnings.length}
					<div
						class="border-destructive/40 bg-destructive/10 text-destructive space-y-2 rounded-lg border px-3 py-2 text-sm"
						role="status"
					>
						<p class="font-medium">Datenintegrität: Abweichung &gt; 1 %</p>
						<ul class="list-inside list-disc space-y-1">
							{#each thhIntegrityWarnings as w (`${w.thhId}-${w.year}`)}
								<li>
									<span class="font-mono">{w.thhId}</span> ({w.year}): Summe Produkte
									|Aufwendungen| = {w.sumProductsAbs.toLocaleString('de-DE', {
										style: 'currency',
										currency: 'EUR',
									})}, THH „Anteilige ordentliche Aufwendungen“ =
									{w.totalOfficialAbs.toLocaleString('de-DE', {
										style: 'currency',
										currency: 'EUR',
									})} → Δ
									{w.deviationPct.toFixed(2)} %
								</li>
							{/each}
						</ul>
					</div>
				{/if}

				{#if sankeyView === 'expense' && !(data.thhBundle?.lines?.length)}
					<p class="text-muted-foreground text-sm">
						Keine THH-Zeilen geladen. Lege
						<code class="text-xs">data/{TEILHAUSHALTE_WORKBOOK_FILENAME}</code>
						ins Projekt (alle Arbeitsblätter werden eingelesen).
					</p>
				{:else if sankeyView === 'steuern' && !(data.thh61SteuerLines?.length)}
					<p class="text-muted-foreground text-sm">
						Keine Steueraufschlüsselung aus THH61 — prüfe Blatt
						<code class="text-xs">THH61</code> in
						<code class="text-xs">data/{TEILHAUSHALTE_WORKBOOK_FILENAME}</code>.
					</p>
				{:else if sankeyView === 'steuernPool' && !(data.thh61SteuerLines?.length)}
					<p class="text-muted-foreground text-sm">
						{#if data.thh61SheetFound === false}
							Es wurde kein Arbeitsblatt <code class="text-xs">THH61</code> in
							<code class="text-xs">data/{TEILHAUSHALTE_WORKBOOK_FILENAME}</code> gefunden — oder die
							Mappe liegt nicht unter diesem Namen im Ordner <code class="text-xs">data/</code>.
						{:else}
							<code class="text-xs">THH61</code> ist vorhanden, aber es wurden keine Ertragszeilen
							erkannt. Erste Zeile: Spalten für <strong>Ansatz 2025</strong> und
							<strong>Ansatz 2026</strong> (nur ein Jahr reicht); in der zweiten Spalte Vorzeichen
							<strong>+</strong>/<strong>−</strong> (Excel darf hier auch ein Unicode-Minus verwenden).
						{/if}
					</p>
				{:else if sankeyGraph.links.length === 0}
					<p class="text-muted-foreground text-sm">
						{#if sankeyView === 'steuern'}
							Keine Steuerflüsse darstellbar (fehlende Ansätze {year} oder keine positiven Erträge je
							Dezernat im CSV).
						{:else if sankeyView === 'steuernPool'}
							{thh61SteuerPoolEmptyReason}
						{:else}
							Keine Aufwendungsflüsse für die aktuelle Filterung ({year}).
						{/if}
					</p>
				{:else}
					<BudgetSankey
						graph={sankeyGraph}
						variant={sankeyView === 'steuernPool' ? 'steuernPool' : sankeyView}
					/>
					{#if sankeyView === 'steuernPool' && sankeyGraph.links.length && exemplarThhSankeyGraphs.length}
						<div class="border-border/60 space-y-6 border-t pt-6">
							<h3 class="text-foreground text-sm font-semibold tracking-tight">
								Teilhaushalte (Beispiele)
							</h3>
							<p class="text-muted-foreground max-w-3xl text-xs leading-relaxed">
								Direkt unter dem THH61-Sankey, untereinander: THH → Aufwendungsarten (Wirtschaftspläne
								aus der Mappe, ohne Soll-Summenzeile), {year}. Nur zur optischen Vergleichbarkeit:
								Kantenstärken sind so skaliert, dass der Gesamtfluss je THH dem
								<strong class="text-foreground font-medium">Zufluss in „THH61 Erträge“</strong> im
								oberen Diagramm entspricht; Tooltip-Beträge bleiben die unskalierten Werte aus den
								THH-Dateien.
							</p>
							<div class="flex flex-col gap-10">
								{#each exemplarThhSankeyGraphs as ex (ex.id)}
									<div class="space-y-2">
										<p class="text-foreground text-xs font-medium">{ex.title}</p>
										<BudgetSankey
											graph={ex.graph}
											variant="expense"
											layoutFlowScale={ex.layoutFlowScale}
											matchSteuernPoolLayout={true}
										/>
									</div>
								{/each}
							</div>
						</div>
					{/if}
				{/if}
			</Card.Content>
		</Card.Root>

		<Card.Root class="shadow-sm">
			<Card.Header>
				<Card.Title>Deep Dive — Waterfall</Card.Title>
				<Card.Description>
					Kumulierte Erträge, Aufwendungen und resultierender Saldo für ein Dezernat ({year}).
				</Card.Description>
			</Card.Header>
			<Card.Content class="space-y-4">
				<div class="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
					<span class="text-muted-foreground text-sm font-medium">Dezernat</span>
					<Select.Root type="single" bind:value={selectedDez}>
						<Select.Trigger class="min-w-[min(100%,280px)]">
							<span data-slot="select-value" class="truncate">
								{selectedDez || 'Dezernat wählen'}
							</span>
						</Select.Trigger>
						<Select.Content>
							{#each data.dezernate as d (d)}
								<Select.Item value={d} label={d} />
							{/each}
						</Select.Content>
					</Select.Root>
				</div>
				<DezernatWaterfall steps={waterfallSteps} />
			</Card.Content>
		</Card.Root>

		<p class="text-muted-foreground border-t pt-6 text-center text-xs">
			Datenquelle: Open Data Stadt Freiburg. Hinweis: Zeichen wie „?“ in Produktbezeichnungen stammen
			von der CSV-Kodierung (ggf. als UTF-8 neu exportieren).
		</p>
	</div>
</div>
