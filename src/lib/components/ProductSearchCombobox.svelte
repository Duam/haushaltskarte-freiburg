<script lang="ts">
	import { Input } from '$lib/components/ui/input/index.js';
	import type { BudgetRow } from '$lib/data/budget-types.js';
	import {
		listUniqueProductBezeichnungen,
		suggestProductBezeichnungen,
	} from '$lib/data/budget-csv.js';
	import { cn } from '$lib/utils.js';

	let {
		rows,
		value = $bindable(''),
		id = 'product-search',
		placeholder = 'Tippen für Vorschläge…',
		class: className = '',
	}: {
		rows: BudgetRow[];
		value?: string;
		id?: string;
		placeholder?: string;
		class?: string;
	} = $props();

	let open = $state(false);
	let highlight = $state(-1);
	let rootEl: HTMLDivElement | null = $state(null);

	const listId = $derived(`${id}-listbox`);

	const allLabels = $derived(listUniqueProductBezeichnungen(rows));
	const suggestions = $derived(suggestProductBezeichnungen(allLabels, value));

	const showList = $derived(open && value.trim().length > 0);

	function pick(label: string) {
		value = label;
		open = false;
		highlight = -1;
	}

	function onInput() {
		open = true;
		highlight = -1;
	}

	function onFocus() {
		if (value.trim().length > 0) open = true;
	}

	function close() {
		open = false;
		highlight = -1;
	}

	function onKeydown(e: KeyboardEvent) {
		if (!showList && e.key !== 'Escape') return;

		if (e.key === 'ArrowDown') {
			e.preventDefault();
			if (!open && value.trim()) open = true;
			if (suggestions.length === 0) return;
			highlight = Math.min(highlight + 1, suggestions.length - 1);
		} else if (e.key === 'ArrowUp') {
			e.preventDefault();
			highlight = Math.max(highlight - 1, -1);
		} else if (e.key === 'Enter') {
			if (highlight >= 0 && suggestions[highlight]) {
				e.preventDefault();
				pick(suggestions[highlight]);
			}
		} else if (e.key === 'Escape') {
			e.preventDefault();
			close();
		}
	}

	/** Markiert den Suchtreffer in der Vorschau (case-insensitive). */
	function highlightMatch(text: string, q: string): { before: string; match: string; after: string } {
		const t = q.trim();
		if (!t) return { before: text, match: '', after: '' };
		const low = text.toLowerCase();
		const i = low.indexOf(t.toLowerCase());
		if (i < 0) return { before: text, match: '', after: '' };
		return {
			before: text.slice(0, i),
			match: text.slice(i, i + t.length),
			after: text.slice(i + t.length),
		};
	}
</script>

<svelte:window
	onpointerdown={(e) => {
		if (rootEl && !rootEl.contains(e.target as Node)) close();
	}}
/>

<div bind:this={rootEl} class={cn('relative max-w-md', className)}>
	<label class="text-muted-foreground mb-2 block text-xs font-medium uppercase tracking-wide" for={id}>
		Suche (Produktbezeichnung)
	</label>
	<Input
		{id}
		type="search"
		{placeholder}
		bind:value
		autocomplete="off"
		spellcheck={false}
		role="combobox"
		aria-autocomplete="list"
		aria-expanded={showList}
		aria-controls={listId}
		aria-activedescendant={highlight >= 0 ? `${id}-opt-${highlight}` : undefined}
		oninput={onInput}
		onfocus={onFocus}
		onkeydown={onKeydown}
	/>
	{#if showList}
		<ul
			id={listId}
			role="listbox"
			class="bg-popover text-popover-foreground ring-foreground/10 absolute z-50 mt-1 max-h-64 w-full overflow-auto rounded-lg border py-1 text-sm shadow-md"
		>
			{#if suggestions.length === 0}
				<li class="text-muted-foreground px-3 py-2" role="presentation">Keine Vorschläge für „{value.trim()}“</li>
			{:else}
				{#each suggestions as s, i (s)}
					{@const parts = highlightMatch(s, value)}
					<li role="presentation">
						<button
							id="{id}-opt-{i}"
							type="button"
							role="option"
							aria-selected={i === highlight}
							class={cn(
								'hover:bg-accent hover:text-accent-foreground w-full cursor-default px-3 py-2 text-left transition-colors',
								i === highlight && 'bg-accent text-accent-foreground'
							)}
							onmousedown={(e) => e.preventDefault()}
							onclick={() => pick(s)}
							onmouseenter={() => (highlight = i)}
						>
							<span class="line-clamp-2">
								{parts.before}{#if parts.match}<mark
										class="bg-primary/15 text-foreground rounded-sm px-0.5 font-medium"
										>{parts.match}</mark
									>{/if}{parts.after}
							</span>
						</button>
					</li>
				{/each}
			{/if}
		</ul>
	{/if}
	<p class="text-muted-foreground mt-1.5 text-xs">
		Tippen filtert Treemap &amp; Sankey. Pfeiltasten wählen, Eingabe übernimmt.
	</p>
</div>
