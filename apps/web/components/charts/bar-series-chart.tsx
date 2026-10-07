"use client";
import { Button } from "@aptransit/ui";
import { useId, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

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
  /** A line for a series over time; bars otherwise. */
  kind?: "bar" | "line";
  /** Bars along the y axis, for ranked lists with long labels (route codes). */
  horizontal?: boolean;
  labels: { showTable: string; hideTable: string };
}

/** One series of bars with a data table toggle (see the chart rules in index.ts). */
export function BarSeriesChart({ title, data, xLabel, yLabel, format, tone = "info", kind = "bar", horizontal = false, labels }: BarSeriesChartProps) {
  const color = `var(--${tone}-solid)`;
  const axisText = { fill: "var(--text-muted)", fontSize: 12 };
  const tooltip = (
    <Tooltip
      formatter={(v) => [format(Number(v)), yLabel]}
      contentStyle={{ background: "var(--surface-raised)", border: "1px solid var(--border)", color: "var(--text)" }}
    />
  );
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
          {kind === "line" ? (
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={axisText} label={{ value: xLabel, position: "insideBottom", offset: -16, ...axisText }} />
              <YAxis tickFormatter={(v: number) => format(v)} tick={axisText} label={{ value: yLabel, angle: -90, position: "insideLeft", ...axisText }} />
              {tooltip}
              <Line dataKey="value" stroke={color} strokeWidth={2} dot={{ r: 3, fill: color }} isAnimationActive={false} />
            </LineChart>
          ) : horizontal ? (
            <BarChart data={data} layout="vertical" margin={{ top: 8, right: 16, bottom: 24, left: 8 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis type="number" tickFormatter={(v: number) => format(v)} tick={axisText} label={{ value: yLabel, position: "insideBottom", offset: -16, ...axisText }} />
              <YAxis type="category" dataKey="label" width={96} tick={axisText} />
              {tooltip}
              <Bar dataKey="value" fill={color} radius={[0, 4, 4, 0]} isAnimationActive={false} />
            </BarChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 24, left: 8 }}>
              <CartesianGrid vertical={false} stroke="var(--border)" />
              <XAxis dataKey="label" tick={axisText} label={{ value: xLabel, position: "insideBottom", offset: -16, ...axisText }} />
              <YAxis tickFormatter={(v: number) => format(v)} tick={axisText} label={{ value: yLabel, angle: -90, position: "insideLeft", ...axisText }} />
              {tooltip}
              <Bar dataKey="value" fill={color} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          )}
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
