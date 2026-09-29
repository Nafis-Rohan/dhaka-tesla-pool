// Amounts from the API are always integer paisa; this is the one place that converts to taka for display.
export function formatPaisa(paisa) {
  return `৳${(paisa / 100).toFixed(2)}`
}
