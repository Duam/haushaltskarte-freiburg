<script lang="ts">
	import type { WaterfallStep } from '$lib/data/budget-types.js';
	import { formatEur } from '$lib/format-eur.js';
	import { cn } from '$lib/utils.js';

	let { steps }: { steps: WaterfallStep[] } = $props();

	const pad = { l: 40, r: 40, t: 28, b: 52 };
	const plotW = 560;
	const plotH = 200;

	const scale = $derived.by(() => {
		const ys = steps.flatMap((s) => [s.start, s.end]);
		const minY = Math.min(0, ...ys);
		const maxY = Math.max(0, ...ys);
		const span = maxY - minY || 1;
		return (v: number) => pad.t + ((maxY - v) / span) * plotH;
	});

	function barTop(s: WaterfallStep): number {
		return Math.min(scale(s.start), scale(s.end));
	}

	function barHeight(s: WaterfallStep): number {
		return Math.max(Math.abs(scale(s.end) - scale(s.start)), 2);
	}

	const barWidth = 68;
	const n = $derived(Math.max(steps.length, 1));
	const gap = $derived((plotW - n * barWidth) / (n + 1));

	function barX(i: number): number {
		return pad.l + gap + i * (barWidth + gap);
	}

	function barColor(s: WaterfallStep, i: number): string {
		if (i === 2) {
			return s.kind === 'positive'
				? 'fill-emerald-500/90'
				: 'fill-rose-500/90';
		}
		return s.kind === 'positive' ? 'fill-emerald-500/85' : 'fill-rose-500/85';
	}
</script>

<div class="bg-card text-card-foreground w-full overflow-x-auto rounded-xl ring-1 ring-foreground/10">
	<svg
		class="mx-auto block min-w-[320px] max-w-full"
		viewBox="0 0 {plotW + pad.l + pad.r} {plotH + pad.t + pad.b}"
		role="img"
		aria-label="Waterfall: Erträge, Aufwendungen, Saldo"
	>
		<line
			x1={pad.l}
			y1={scale(0)}
			x2={pad.l + plotW}
			y2={scale(0)}
			class="stroke-border"
			stroke-width="1"
			stroke-dasharray="4 4"
		/>

		{#each steps as s, i (s.key)}
			{@const x = barX(i)}
			{@const y = barTop(s)}
			{@const h = barHeight(s)}
			<g class="pointer-events-auto">
				<title>
					{s.label}: {formatEur(s.value)} — Stufe {formatEur(s.start)} → {formatEur(s.end)}
				</title>
				<rect {x} {y} width={barWidth} height={h} rx="4" class={cn(barColor(s, i))} />
				<text
					x={x + barWidth / 2}
					y={plotH + pad.t + 24}
					text-anchor="middle"
					class="fill-muted-foreground text-[11px] font-medium"
				>
					{s.label}
				</text>
				<text
					x={x + barWidth / 2}
					y={y - 6}
					text-anchor="middle"
					class="fill-foreground text-[10px] font-semibold"
				>
					{formatEur(s.value)}
				</text>
			</g>
		{/each}
	</svg>
</div>
