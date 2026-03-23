<script lang="ts">
	import { onMount, tick } from 'svelte';
	import { nonPassiveWheel } from '$lib/actions/non-passive-wheel.js';
	import BudgetSankey from '$lib/charts/BudgetSankey.svelte';
	import type { BudgetYear } from '$lib/data/budget-types.js';
	import { TEILHAUSHALTE_WORKBOOK_FILENAME } from '$lib/data/teilhaushalte-workbook.js';
	import { buildSankeySteuerPoolThh61AufwandGraph } from '$lib/data/thh61-steuer.js';

	/** Logische Kartengröße (muss zu BudgetSankey mapMode passen). */
	const MAP_W = 3400;
	const MAP_H = 2600;
	const PAD = 24;

	let { data } = $props();

	let yearTab = $state<'2025' | '2026'>('2025');
	let mapScrollEl = $state<HTMLDivElement | null>(null);
	/** ≥1: Vergrößerung relativ zur „Alles sichtbar“-Skalierung */
	let zoomFactor = $state(1);
	let fitScale = $state(0.22);

	const year = $derived((yearTab === '2026' ? 2026 : 2025) as BudgetYear);

	const sankeyGraph = $derived(
		buildSankeySteuerPoolThh61AufwandGraph(
			data.thh61SteuerLines ?? [],
			data.thh61AufwandBuckets ?? [],
			year,
			data.thh61Nettoresource ?? null
		)
	);

	const totalScale = $derived(fitScale * zoomFactor);

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
		return 'THH61-Sankey konnte nicht aufgebaut werden.';
	});

	function measureFit() {
		const el = mapScrollEl;
		if (!el) return;
		const w = el.clientWidth - PAD * 2;
		const h = el.clientHeight - PAD * 2;
		if (w <= 0 || h <= 0) return;
		fitScale = Math.min(w / MAP_W, h / MAP_H);
	}

	function centerScroll() {
		const el = mapScrollEl;
		if (!el) return;
		const innerW = PAD * 2 + MAP_W * totalScale;
		const innerH = PAD * 2 + MAP_H * totalScale;
		queueMicrotask(() => {
			el.scrollLeft = Math.max(0, (innerW - el.clientWidth) / 2);
			el.scrollTop = Math.max(0, (innerH - el.clientHeight) / 2);
		});
	}

	function zoomWithWheel(e: WheelEvent) {
		if (!e.ctrlKey && !e.metaKey) return;
		e.preventDefault();
		const el = mapScrollEl;
		if (!el) return;

		const sOld = fitScale * zoomFactor;
		const factor = Math.exp(-e.deltaY * 0.0012);
		const next = Math.min(10, Math.max(1, zoomFactor * factor));
		if (Math.abs(next - zoomFactor) < 1e-6) return;

		const rect = el.getBoundingClientRect();
		const ex = e.clientX - rect.left;
		const ey = e.clientY - rect.top;
		const worldX = (el.scrollLeft + ex - PAD) / sOld;
		const worldY = (el.scrollTop + ey - PAD) / sOld;

		zoomFactor = next;
		const sNew = fitScale * zoomFactor;

		queueMicrotask(() => {
			el.scrollLeft = Math.max(0, worldX * sNew + PAD - ex);
			el.scrollTop = Math.max(0, worldY * sNew + PAD - ey);
		});
	}

	function resetView() {
		zoomFactor = 1;
		tick().then(() => {
			measureFit();
			tick().then(centerScroll);
		});
	}

	onMount(() => {
		measureFit();
		tick().then(centerScroll);
	});

	$effect(() => {
		const el = mapScrollEl;
		if (!el) return;
		const ro = new ResizeObserver(() => {
			measureFit();
			tick().then(centerScroll);
		});
		ro.observe(el);
		return () => ro.disconnect();
	});

	$effect(() => {
		yearTab;
		sankeyGraph.links.length;
		zoomFactor = 1;
		measureFit();
		tick().then(centerScroll);
	});
</script>

<svelte:head>
	<title>THH61 — Haushaltskarte Freiburg</title>
	<meta
		name="description"
		content="Interaktive Karte: Ertragsflüsse und Aufwendungen Teilhaushalt 61 (Ansätze aus der Teilhaushalte-Mappe)."
	/>
</svelte:head>

<div class="bg-background text-foreground flex h-svh min-h-0 flex-col overflow-hidden">
	<header
		class="border-border/60 bg-background/95 supports-[backdrop-filter]:bg-background/80 z-20 flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-3 py-2.5 shadow-sm backdrop-blur-sm md:px-4"
	>
		<div class="min-w-0">
			<h1 class="text-base font-semibold tracking-tight md:text-lg">THH61 — Haushaltskarte</h1>
			<p class="text-muted-foreground hidden text-xs sm:block">
				Ertragsquellen → THH61 Erträge → Aufwand &amp; Nettoresource ({year})
			</p>
		</div>
		<div class="flex flex-wrap items-center gap-2">
			<button
				type="button"
				class="border-border bg-muted/60 text-muted-foreground hover:bg-muted hover:text-foreground rounded-md border px-2.5 py-1 text-xs font-medium transition-colors"
				onclick={resetView}
			>
				Gesamtansicht
			</button>
			<div class="flex items-center gap-2">
				<span class="text-muted-foreground text-xs font-medium">Jahr</span>
				<div
					class="border-border bg-muted/40 inline-flex rounded-lg border p-0.5"
					role="group"
					aria-label="Haushaltsjahr"
				>
					<button
						type="button"
						class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:text-sm {yearTab ===
						'2025'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (yearTab = '2025')}
					>
						2025
					</button>
					<button
						type="button"
						class="rounded-md px-3 py-1.5 text-xs font-medium transition-colors md:text-sm {yearTab ===
						'2026'
							? 'bg-background text-foreground shadow-sm'
							: 'text-muted-foreground hover:text-foreground'}"
						onclick={() => (yearTab = '2026')}
					>
						2026
					</button>
				</div>
			</div>
		</div>
	</header>

	<div
		bind:this={mapScrollEl}
		class="map-canvas-scroll min-h-0 flex-1 overflow-auto overscroll-contain"
		role="application"
		aria-label="Haushaltskarte THH61: zoomen mit Steuerung und Mausrad, verschieben mit Scroll oder Touch"
		use:nonPassiveWheel={zoomWithWheel}
	>
		<div
			class="inline-block"
			style:padding="{PAD}px"
			style:width="{PAD * 2 + MAP_W * totalScale}px"
			style:height="{PAD * 2 + MAP_H * totalScale}px"
		>
			{#if !(data.thh61SteuerLines?.length)}
				<div class="text-muted-foreground max-w-lg p-6 text-sm">
					{#if data.thh61SheetFound === false}
						Kein Arbeitsblatt <code class="text-xs">THH61</code> in
						<code class="text-xs">data/{TEILHAUSHALTE_WORKBOOK_FILENAME}</code> — oder die Mappe fehlt.
					{:else}
						<code class="text-xs">THH61</code> vorhanden, aber keine Ertragszeilen erkannt. Kopfzeile mit
						<strong>Ansatz 2025</strong> / <strong>Ansatz 2026</strong>; in der Vorzeichenspalte
						<strong>+</strong> für Ertragsabschnitte.
					{/if}
				</div>
			{:else if sankeyGraph.links.length === 0}
				<p class="text-muted-foreground max-w-lg p-6 text-sm">{thh61SteuerPoolEmptyReason}</p>
			{:else}
				<div
					class="overflow-hidden"
					style:width="{MAP_W * totalScale}px"
					style:height="{MAP_H * totalScale}px"
				>
					<div
						style:width="{MAP_W}px"
						style:height="{MAP_H}px"
						style:transform="scale({totalScale})"
						style:transform-origin="0 0"
					>
						<BudgetSankey
							graph={sankeyGraph}
							variant="steuernPool"
							mapMode={true}
							mapWidth={MAP_W}
							mapHeight={MAP_H}
							mapViewportFitScale={fitScale}
							mapLabelTargetScreenPx={15}
						/>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<footer
		class="border-border/60 bg-background/95 text-muted-foreground pointer-events-none z-20 border-t px-3 py-2 text-center text-[11px] md:text-xs"
	>
		<strong class="text-foreground font-medium">Strg</strong> (Windows) oder <strong class="text-foreground font-medium"
			>⌘</strong
		>
		+ Mausrad / Trackpad zum Zoomen · Scrollen oder Touch zum Verschieben ·
		<span class="text-foreground font-medium">Gesamtansicht</span> setzt Zoom zurück. Daten: THH61 (XLSX).
	</footer>
</div>
