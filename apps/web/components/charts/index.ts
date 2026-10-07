// Chart rules (Day 17, docs/09):
// - Recharts only. Colours come from tokens through CSS variables (var(--info-solid)), never hex.
// - One accent colour for a single series, neutral for context, status tones only when the data
//   is a status (delay, demand level).
// - No 3D, no pie charts for more than 3 parts.
// - Axis labels and units always; tooltips in the user's language and number formats.
// - Tabular numbers; every chart has a "Show table" toggle with the exact values, which is also
//   what screen readers read (the drawing itself is hidden from them).
export { BarSeriesChart, type BarSeriesChartProps, type ChartPoint } from "./bar-series-chart";
