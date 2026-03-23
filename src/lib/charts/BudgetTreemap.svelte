<script lang="ts">
	import { hierarchy, type HierarchyNode, type HierarchyRectangularNode } from 'd3-hierarchy';
	import { Chart, Svg, Treemap, Rect } from 'layerchart';
	import type { TreemapDatum } from '$lib/data/budget-types.js';
	import { formatEur } from '$lib/format-eur.js';

	let { root }: { root: TreemapDatum } = $props();

	const tree = $derived(
		hierarchy(root)
			.sum((d: TreemapDatum) => d.value ?? 0)
			.sort(
				(a: HierarchyNode<TreemapDatum>, b: HierarchyNode<TreemapDatum>) =>
					(b.value ?? 0) - (a.value ?? 0)
			)
	);

	function fillFor(d: TreemapDatum): string {
		if (d.children?.length) return 'oklch(0.96 0.008 264 / 0.45)';
		const saldo = d.meta?.saldo ?? 0;
		return saldo >= 0 ? 'oklch(0.72 0.14 163 / 0.9)' : 'oklch(0.68 0.19 22 / 0.9)';
	}

	function strokeFor(d: TreemapDatum): string {
		return d.children?.length ? 'oklch(0.88 0.01 264)' : 'oklch(1 0 0 / 0.65)';
	}

	function tooltipLines(node: HierarchyRectangularNode<TreemapDatum>): string {
		const path = [...node.ancestors()]
			.reverse()
			.map((a) => a.data.name)
			.join(' › ');
		const d = node.data;
		if (!d.meta) return path;
		return [
			path,
			`Erträge: ${formatEur(d.meta.ertraege)}`,
			`Aufwendungen: ${formatEur(d.meta.aufwendungen)}`,
			`Saldo: ${formatEur(d.meta.saldo)}`,
			`Produkt-Nr.: ${d.meta.produkt}`,
		].join('\n');
	}
</script>

<div class="bg-card text-card-foreground w-full overflow-hidden rounded-xl ring-1 ring-foreground/10">
	<!--
		LayerCake uses height:100% and Svg is position:absolute, so the parent needs a definite height.
		`aspect-ratio` alone often fails % height resolution; `absolute inset-0` inside `relative`
		fills the aspect box so clientWidth/clientHeight match the visible canvas.
	-->
	<div class="relative aspect-[16/9] w-full min-h-[280px] md:min-h-[420px]">
		<div class="absolute inset-0 min-h-0">
			<Chart data={tree} padding={{ top: 4, bottom: 4, left: 4, right: 4 }}>
				<Svg>
					<Treemap tile="squarify" paddingInner={1} let:nodes>
					{#each nodes as n, i (i)}
						{@const w = (n.x1 ?? 0) - (n.x0 ?? 0)}
						{@const h = (n.y1 ?? 0) - (n.y0 ?? 0)}
						{#if w > 1 && h > 1}
							<g class="pointer-events-auto">
								<title>{tooltipLines(n)}</title>
								<Rect
									x={n.x0 ?? 0}
									y={n.y0 ?? 0}
									width={w}
									height={h}
									fill={fillFor(n.data)}
									stroke={strokeFor(n.data)}
									strokeWidth={0.5}
								/>
							</g>
						{/if}
					{/each}
					</Treemap>
				</Svg>
			</Chart>
		</div>
	</div>
</div>
