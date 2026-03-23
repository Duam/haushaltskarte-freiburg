const fmt = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });

export function formatEur(value: number): string {
	return fmt.format(value);
}
