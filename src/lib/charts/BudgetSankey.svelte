<script lang="ts">
	import { sankeyJustify } from 'd3-sankey';
	import { Chart, Svg, Sankey, Link, Rect } from 'layerchart';
	import type { SankeyGraphJson } from '$lib/data/budget-types.js';
	import { normalizeFreiburgHaushaltLabel } from '$lib/data/csv-label-normalize.js';
	import { formatEur } from '$lib/format-eur.js';

	let {
		graph,
		variant = 'product',
		/**
		 * Kantenwerte für das Layout mit diesem Faktor multiplizieren (z. B. Teilhaushalt gegenüber
		 * THH61-Gesamtfluss). Tooltips zeigen weiter die Originalbeträge aus `graph`.
		 */
		layoutFlowScale = 1,
		/** Gleiche Außenmaße/Padding wie der THH61-Pool-Sankey — für visuellen Vergleich */
		matchSteuernPoolLayout = false,
	}: {
		graph: SankeyGraphJson;
		/** Steuert Spaltenbezeichnungen in Tooltips / Titeln */
		variant?: 'product' | 'expense' | 'steuern' | 'steuernPool';
		layoutFlowScale?: number;
		matchSteuernPoolLayout?: boolean;
	} = $props();

	type LayoutLinkDatum = SankeyGraphJson['links'][number] & { originalValue?: number };

	type NodeDatum = SankeyGraphJson['nodes'][number] & {
		x0?: number;
		x1?: number;
		y0?: number;
		y1?: number;
		index?: number;
		/** Nach d3-sankey-Layout: Summe der zugehörigen Flüsse (Ein- oder Ausgang). */
		value?: number;
	};

	type NodeHover = {
		nodeKey: string;
		clientX: number;
		clientY: number;
		label: string;
		role: string;
		value: number;
	};

	type LinkHover = {
		/** Gleicher Schlüssel wie in der {#each}-Schleife — für Hover-Highlight der Kante */
		linkKey: string;
		clientX: number;
		clientY: number;
		sourceLabel: string;
		targetLabel: string;
		value: number;
	};

	const data = $derived.by(() => {
		const s = layoutFlowScale;
		const nodes = graph.nodes.map((n) => ({ ...n })) as NodeDatum[];
		const links: LayoutLinkDatum[] = graph.links.map((l) => ({
			...l,
			originalValue: l.value,
			value: l.value * s,
		}));
		return { nodes, links };
	});

	const rescaleNodeTooltip = $derived(Math.abs(layoutFlowScale - 1) > 1e-9);

	/**
	 * d3-sankey sortiert ohne `nodeSort` nach berechneter Breite und verwirft die Input-Reihenfolge.
	 * THH61: feste Index-Sortierung. Steuertopf-Graph nutzt `column` aus den Daten — reine Quellen hätten
	 * sonst trotzdem depth 0 (justify); `nodeAlign` mappt daher explizit auf `column`.
	 */
	const steuerSankeySortProps = $derived(
		variant === 'steuern' || variant === 'steuernPool'
			? {
					nodeSort: (a: { index?: number }, b: { index?: number }) =>
						(a.index ?? 0) - (b.index ?? 0),
					...(variant === 'steuernPool'
						? {
								nodeAlign: (node: NodeDatum, n: number) =>
									typeof node.column === 'number' ? node.column : sankeyJustify(node, n),
							}
						: {}),
				}
			: {}
	);

	const chartPadding = $derived(
		variant === 'steuernPool' || matchSteuernPoolLayout
			? { top: 28, bottom: 16, left: 236, right: 220 }
			: variant === 'steuern'
				? { top: 14, bottom: 14, left: 236, right: 188 }
				: { top: 14, bottom: 14, left: 156, right: 172 }
	);

	const linkStrokeDefault = $derived(
		variant === 'steuern' ? 'oklch(0.48 0.14 152 / 0.55)' : 'oklch(0.45 0.12 264 / 0.55)'
	);

	function columnRole(col: number): string {
		if (variant === 'steuernPool') {
			if (col === 0) return 'Ertragsquelle (THH_61)';
			if (col === 1) return 'Zwischenebene (Kommunal, Zuweisungen, Zinsen, sonstige Erträge)';
			if (col === 2) return 'THH61 Erträge';
			return 'Abfluss: ordentlicher Aufwand, Veranschlagte Nettoresource';
		}
		if (col === 0) {
			if (variant === 'expense') return 'Teilhaushalt';
			if (variant === 'steuern') return 'Ertragsquelle (THH_61)';
			return 'Dezernat';
		}
		if (variant === 'expense') return 'Aufwendungsart';
		if (variant === 'steuern') return 'Dezernat';
		return 'Produktbereich';
	}

	function displayNodeLabel(raw: string): string {
		return normalizeFreiburgHaushaltLabel(raw);
	}

	function nodeTitle(node: NodeDatum): string {
		return `${displayNodeLabel(node.label)} (${columnRole(node.column)})`;
	}

	function ellipsize(label: string, maxChars: number): string {
		const t = label.trim();
		if (t.length <= maxChars) return t;
		return `${t.slice(0, Math.max(1, maxChars - 1))}…`;
	}

	function nodeLabelText(node: NodeDatum): string {
		let max = node.column === 0 ? 34 : 38;
		if (variant === 'steuern') max = node.column === 0 ? 52 : 30;
		if (variant === 'steuernPool') {
			if (node.column === 0) max = 50;
			else if (node.column === 1) max = 22;
			else if (node.column === 2) max = 22;
			else max = 28;
		}
		return ellipsize(displayNodeLabel(node.label), max);
	}

	let linkHover = $state<LinkHover | null>(null);
	let nodeHover = $state<NodeHover | null>(null);

	function clearChartTooltips() {
		linkHover = null;
		nodeHover = null;
	}

	function showNodeTooltip(e: PointerEvent, n: NodeDatum) {
		const raw = n.value ?? 0;
		const v = rescaleNodeTooltip ? raw / layoutFlowScale : raw;
		linkHover = null;
		nodeHover = {
			nodeKey: n.id,
			clientX: e.clientX,
			clientY: e.clientY,
			label: displayNodeLabel(n.label),
			role: columnRole(n.column),
			value: v,
		};
	}

	function moveNodeTooltip(e: PointerEvent) {
		if (!nodeHover) return;
		nodeHover = {
			...nodeHover,
			clientX: e.clientX,
			clientY: e.clientY,
		};
	}

	function hideNodeTooltip() {
		nodeHover = null;
	}

	function showLinkTooltip(
		e: PointerEvent,
		src: NodeDatum,
		tgt: NodeDatum,
		value: number,
		li: number,
		originalValue?: number
	) {
		nodeHover = null;
		const displayVal = originalValue !== undefined ? originalValue : value;
		linkHover = {
			linkKey: linkKeyFor(src, tgt, displayVal, li),
			clientX: e.clientX,
			clientY: e.clientY,
			sourceLabel: displayNodeLabel(src.label),
			targetLabel: displayNodeLabel(tgt.label),
			value: displayVal,
		};
	}

	function moveLinkTooltip(e: PointerEvent) {
		if (!linkHover) return;
		linkHover = {
			...linkHover,
			clientX: e.clientX,
			clientY: e.clientY,
		};
	}

	function hideLinkTooltip() {
		linkHover = null;
	}

	function linkVisStroke(src: NodeDatum): string {
		if (variant === 'steuernPool') {
			if (src.column === 0) return 'oklch(0.48 0.14 152 / 0.55)';
			if (src.column === 1) return 'oklch(0.52 0.11 75 / 0.55)';
			return 'oklch(0.45 0.12 264 / 0.55)';
		}
		return linkStrokeDefault;
	}

	/** Hover: nur andere Farbe, gleiche Strichstärke wie `linkVisStroke`. */
	function linkVisStrokeHover(src: NodeDatum): string {
		if (variant === 'steuernPool') {
			if (src.column === 0) return 'oklch(0.42 0.18 152 / 0.88)';
			if (src.column === 1) return 'oklch(0.48 0.14 75 / 0.88)';
			return 'oklch(0.38 0.16 264 / 0.88)';
		}
		if (variant === 'steuern') {
			return 'oklch(0.42 0.18 152 / 0.88)';
		}
		return 'oklch(0.38 0.16 264 / 0.88)';
	}

	function linkKeyFor(src: NodeDatum, tgt: NodeDatum, value: number, li: number): string {
		return `${src.id}-${tgt.id}-${value}-${li}`;
	}

	/** Nach d3-sankey-Layout: Kantendicke in Pixeln (proportional zum Flusswert). */
	function linkStrokeWidth(link: { width?: number }): number {
		const w = link.width ?? 0;
		return Math.max(w, 0.35);
	}

	/** Trefferzone = gleiche Pixelbreite wie die gezeichnete Kante (d3-sankey `link.width`). */
	function linkHitStrokeWidth(link: { width?: number }): number {
		return linkStrokeWidth(link);
	}
</script>

<div
	class="bg-card text-card-foreground relative w-full overflow-visible rounded-xl ring-1 ring-foreground/10"
>
	<div
		class="relative aspect-[21/9] w-full min-h-[320px] md:min-h-[480px] {variant === 'steuernPool' ||
		matchSteuernPoolLayout
			? 'md:min-h-[520px]'
			: ''}"
	>
		<div
			class="absolute inset-0 min-h-0"
			onpointerleave={clearChartTooltips}
			role="presentation"
		>
			<Chart {data} padding={chartPadding}>
				<Svg>
					<!-- layerchart: nodeSort typisiert fälschlich nur undefined; d3-sankey unterstützt Comparator -->
					<Sankey
						nodeWidth={12}
						nodePadding={8}
						nodeAlign="justify"
						{...(steuerSankeySortProps as Record<string, unknown>)}
						let:nodes
						let:links
					>
						{#each links as link, li (`${(link.source as NodeDatum).id}-${(link.target as NodeDatum).id}-${(link as LayoutLinkDatum).originalValue ?? link.value}-${li}`)}
							{@const src = link.source as NodeDatum}
							{@const tgt = link.target as NodeDatum}
							{@const lk = link as LayoutLinkDatum}
							{@const orig = lk.originalValue}
							{@const displayVal = orig !== undefined ? orig : link.value}
							{@const lkKey = linkKeyFor(src, tgt, displayVal, li)}
							{@const isHovered = linkHover?.linkKey === lkKey}
							<g class="sankey-link-group">
								<Link
									data={link}
									sankey
									stroke="transparent"
									strokeWidth={linkHitStrokeWidth(link)}
									class="cursor-crosshair"
									onpointerenter={(e) => showLinkTooltip(e, src, tgt, link.value, li, orig)}
									onpointermove={moveLinkTooltip}
									onpointerleave={hideLinkTooltip}
									onpointercancel={hideLinkTooltip}
								/>
								<Link
									data={link}
									sankey
									stroke={isHovered ? linkVisStrokeHover(src) : linkVisStroke(src)}
									strokeWidth={linkStrokeWidth(link)}
									class="pointer-events-none"
								/>
							</g>
						{/each}
						{#each nodes as node (node.index ?? (node as NodeDatum).id)}
							{@const n = node as NodeDatum}
							{@const yMid = ((n.y0 ?? 0) + (n.y1 ?? 0)) / 2}
							{@const xMid = ((n.x0 ?? 0) + (n.x1 ?? 0)) / 2}
							<g>
								<title>{nodeTitle(n)}</title>
								<Rect
									x={n.x0 ?? 0}
									y={n.y0 ?? 0}
									width={(n.x1 ?? 0) - (n.x0 ?? 0)}
									height={(n.y1 ?? 0) - (n.y0 ?? 0)}
									fill="currentColor"
									class="text-muted-foreground/85 cursor-crosshair"
									rx={2}
									onpointerenter={(e) => showNodeTooltip(e, n)}
									onpointermove={moveNodeTooltip}
									onpointerleave={hideNodeTooltip}
									onpointercancel={hideNodeTooltip}
								/>
								{#if variant === 'steuernPool' && n.column === 2}
									<text
										x={xMid}
										y={(n.y0 ?? 0) - 8}
										dominant-baseline="auto"
										text-anchor="middle"
										class="pointer-events-none fill-foreground font-sans text-[11px] leading-tight font-medium"
										style="paint-order: stroke; stroke: var(--card); stroke-width: 3px;"
									>
										{nodeLabelText(n)}
									</text>
								{:else}
									<text
										x={n.column === 0 ? (n.x0 ?? 0) - 8 : (n.x1 ?? 0) + 8}
										y={yMid}
										dominant-baseline="middle"
										text-anchor={n.column === 0 ? 'end' : 'start'}
										class="pointer-events-none fill-foreground font-sans text-[11px] leading-tight font-medium"
										style="paint-order: stroke; stroke: var(--card); stroke-width: 3px;"
									>
										{nodeLabelText(n)}
									</text>
								{/if}
							</g>
						{/each}
					</Sankey>
				</Svg>
			</Chart>
		</div>
	</div>

	{#if linkHover}
		<div
			class="border-border/80 bg-popover text-popover-foreground pointer-events-none fixed z-50 max-w-[min(100vw-24px,280px)] rounded-lg border px-3 py-2.5 text-sm shadow-md ring-1 ring-foreground/5"
			style:left="{linkHover.clientX + 14}px"
			style:top="{linkHover.clientY + 14}px"
			role="status"
		>
			<p class="leading-snug">
				<span class="text-muted-foreground">Von </span>
				<span class="text-foreground font-medium">{linkHover.sourceLabel}</span>
			</p>
			<p class="mt-1 leading-snug">
				<span class="text-muted-foreground">Nach </span>
				<span class="text-foreground font-medium">{linkHover.targetLabel}</span>
			</p>
			<p class="text-foreground mt-2 font-mono text-base font-semibold tabular-nums">
				{formatEur(linkHover.value)}
			</p>
		</div>
	{:else if nodeHover}
		<div
			class="border-border/80 bg-popover text-popover-foreground pointer-events-none fixed z-50 max-w-[min(100vw-24px,280px)] rounded-lg border px-3 py-2.5 text-sm shadow-md ring-1 ring-foreground/5"
			style:left="{nodeHover.clientX + 14}px"
			style:top="{nodeHover.clientY + 14}px"
			role="status"
		>
			<p class="text-foreground font-medium leading-snug">{nodeHover.label}</p>
			<p class="text-muted-foreground mt-0.5 text-xs leading-snug">{nodeHover.role}</p>
			<p class="text-muted-foreground mt-2 text-xs leading-snug">Fluss (Summe)</p>
			<p class="text-foreground font-mono text-base font-semibold tabular-nums">
				{formatEur(nodeHover.value)}
			</p>
		</div>
	{/if}
</div>
