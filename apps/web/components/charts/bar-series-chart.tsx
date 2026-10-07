"use client";
import { Button } from "@aptransit/ui";
import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export interface ChartPoint {
  label: string;
  value: number;
}

export interface BarSeriesChartProps {
  title: string;
  data: ChartPoint[];
  /** Axis titles with units, for example "Hour of day (IST)" and "Average delay (min)". */
  xLabel: string;
  yLabel: string;
  /** Formats a value for the tooltip, the axis and the table, in the user's locale. */
  format: (value: number) => string;
  /** Token tone of the bars: info for a plain measure, warning or danger for delays. */
  tone?: "info" | "warning" | "danger" | "success" | "neutral";
  labels: { showTable: string; hideTable: string };
}

/** One series of bars with a data table toggle (see the chart rules in index.ts). */
export function BarSeriesChart({ title, data, xLabel, yLabel, format, tone = "info", labels }: BarSeriesChartProps) {
  const [table, setTable] = useState(false);
  const tableId = useId();
  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <figcaption className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-h3">{title}</span>
        <Button variant="ghost" aria-expanded={table} aria-controls={tableId} onClick={() => setTable((v) => !v)}>
          {table ? labels.hideTable : labels.showTable}
        </Button>
      </figcaption>
      <div className="h-64 w-full tabular-nums" aria-hidden="true">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
            <CartesianGrid vertical={false} stroke="var(--border)" />
            <XAxis
              dataKey="label"
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              label={{ value: xLabel, position: "insideBottom", offset: -16, fill: "var(--text-muted)", fontSize: 12 }}
            />
            <YAxis
              tickFormatter={(v: number) => format(v)}
              tick={{ fill: "var(--text-muted)", fontSize: 12 }}
              label={{ value: yLabel, angle: -90, position: "insideLeft", fill: "var(--text-muted)", fontSize: 12 }}
            />
            <Tooltip
              formatter={(v) => [format(Number(v)), yLabel]}
              contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
            />
            <Bar dataKey="value" fill={`var(--${tone}-solid)`} radius={[4, 4, 0, 0]} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div id={tableId} hidden={!table}>
        <table className="w-full text-small tabular-nums">
          <caption className="sr-only">{title}</caption>
          <thead>
            <tr>
              <th scope="col" className="text-left">
                {xLabel}
              </th>
              <th scope="col" className="text-right">
                {yLabel}
              </th>
            </tr>
          </thead>
          <tbody>
            {data.map((p) => (
              <tr key={p.label}>
                <th scope="row" className="text-left font-normal">
                  {p.label}
                </th>
                <td className="text-right">{format(p.value)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </figure>
  );
}
