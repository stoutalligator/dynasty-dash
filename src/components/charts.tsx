"use client";

import { Area, CartesianGrid, ComposedChart, Label, Line, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

/* Chart tokens resolve per theme (validated series colors); text never wears series color. */
const C = {
  series1: "var(--series-1)",
  neutral: "var(--chart-neutral)",
  grid: "var(--chart-grid)",
  axis: "var(--ink-3)",
  surface: "var(--surface)",
  label: "var(--chart-label)",
};
const ANIM = { isAnimationActive: true, animationDuration: 700, animationEasing: "ease-out" as const };
const TICK = { fill: C.axis, fontSize: 11 };

function TipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-xl border border-line-strong bg-surface/95 px-3 py-2 text-xs text-ink shadow-2xl backdrop-blur">{children}</div>;
}

/** Legend keys: a short line (for lines) or a dot (for points), always next to text-colored labels. */
function LegendRow({ items }: { items: { label: string; color: string; kind: "line" | "dot" }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 px-3 pb-1 text-[11px] text-ink-2">
      {items.map((i) => (
        <span key={i.label} className="inline-flex items-center gap-1.5">
          {i.kind === "line" ? <span className="h-0.5 w-3.5 rounded-full" style={{ background: i.color }} /> : <span className="size-2 rounded-full" style={{ background: i.color }} />}
          {i.label}
        </span>
      ))}
    </div>
  );
}

/** Clean axis bounds that fit the data with a little headroom (no forced zero for scores). */
function niceDomain(values: number[], step: number): [number, number] {
  const lo = Math.min(...values), hi = Math.max(...values);
  return [Math.max(0, Math.floor((lo - step / 2) / step) * step), Math.ceil((hi + step / 2) / step) * step];
}

export type WeeklyPoint = { week: string; mine: number | null; median: number; opponent: number | null; result: string | null };

/** My weekly score vs. the league median (the median is a reference, drawn in neutral gray). */
export function WeeklyScoreChart({ data, teamName }: { data: WeeklyPoint[]; teamName: string }) {
  const values = data.flatMap((d) => [d.median, ...(d.mine != null ? [d.mine] : [])]);
  const domain = niceDomain(values, 20);
  return (
    <div>
      <LegendRow items={[{ label: teamName, color: C.series1, kind: "line" }, { label: "League median", color: C.neutral, kind: "line" }]} />
      <div className="h-60 w-full">
        <ResponsiveContainer>
          <ComposedChart data={data} margin={{ top: 10, right: 20, bottom: 4, left: -8 }}>
            <defs>
              <linearGradient id="mine-wash" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--series-1)" stopOpacity={0.18} />
                <stop offset="100%" stopColor="var(--series-1)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis dataKey="week" tick={TICK} axisLine={{ stroke: C.grid }} tickLine={false} tickMargin={8} />
            <YAxis domain={domain} tick={TICK} axisLine={false} tickLine={false} width={44} tickCount={5} allowDecimals={false} />
            <Tooltip
              cursor={{ stroke: C.neutral, strokeWidth: 1 }}
              content={({ active, payload, label }) =>
                active && payload?.length ? (
                  <TipBox>
                    <div className="mb-1 font-semibold">{label}</div>
                    {(() => {
                      const d = payload[0].payload as WeeklyPoint;
                      return (
                        <div className="tnum space-y-0.5 text-ink-2">
                          <div className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: C.series1 }} />{teamName}: <span className="text-ink">{d.mine?.toFixed(2) ?? "—"}</span>{d.result && ` (${d.result})`}</div>
                          <div className="flex items-center gap-1.5"><span className="h-0.5 w-3 rounded" style={{ background: C.neutral }} />League median: <span className="text-ink">{d.median.toFixed(2)}</span></div>
                          {d.opponent != null && <div>Opponent: <span className="text-ink">{d.opponent.toFixed(2)}</span></div>}
                        </div>
                      );
                    })()}
                  </TipBox>
                ) : null
              }
            />
            <Area type="monotone" dataKey="mine" stroke="none" fill="url(#mine-wash)" {...ANIM} />
            <Line type="monotone" dataKey="median" stroke={C.neutral} strokeWidth={2} strokeLinecap="round" dot={false} {...ANIM} />
            <Line
              type="monotone"
              dataKey="mine"
              stroke={C.series1}
              strokeWidth={2}
              strokeLinecap="round"
              dot={{ r: 4, fill: C.series1, stroke: C.surface, strokeWidth: 2 }}
              activeDot={{ r: 6, stroke: C.surface, strokeWidth: 2 }}
              {...ANIM}
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export type AgeValuePoint = { name: string; age: number; value: number; mine: boolean; strategy: string };

/** Each team's value-weighted age vs. total asset value, split into quadrants at the league medians. */
export function AgeValueChart({ data }: { data: AgeValuePoint[] }) {
  const others = data.filter((d) => !d.mine);
  const mine = data.filter((d) => d.mine);
  const med = (xs: number[]) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? (s[Math.floor((s.length - 1) / 2)] + s[Math.ceil((s.length - 1) / 2)]) / 2 : 0;
  };
  const ageMed = med(data.map((d) => d.age));
  const valMed = med(data.map((d) => d.value));
  const valDomain = niceDomain(data.map((d) => d.value), 10_000);
  return (
    <div>
      <LegendRow items={[{ label: "Your team", color: C.series1, kind: "dot" }, { label: "Other teams", color: C.neutral, kind: "dot" }]} />
      <div className="h-72 w-full">
        <ResponsiveContainer>
          <ScatterChart margin={{ top: 12, right: 28, bottom: 24, left: 8 }}>
            <CartesianGrid stroke={C.grid} vertical={false} strokeOpacity={0.6} />
            <XAxis type="number" dataKey="age" domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={TICK} tickFormatter={(v: number) => v.toFixed(1)} axisLine={{ stroke: C.grid }} tickLine={false} tickMargin={6}>
              <Label value="Value-weighted age (younger ←)" position="bottom" offset={8} fill={C.axis} fontSize={11} />
            </XAxis>
            <YAxis type="number" dataKey="value" domain={valDomain} tick={TICK} tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} axisLine={false} tickLine={false} width={44} />
            <ZAxis range={[110, 110]} />
            <ReferenceLine x={ageMed} stroke={C.grid} strokeWidth={1.5} />
            <ReferenceLine y={valMed} stroke={C.grid} strokeWidth={1.5} />
            <Tooltip
              cursor={false}
              content={({ active, payload }) => {
                const d = active && payload?.[0] ? (payload[0].payload as AgeValuePoint) : null;
                return d ? (
                  <TipBox>
                    <div className="font-semibold">{d.name}</div>
                    <div className="tnum text-ink-2">Age {d.age.toFixed(1)} · Value {d.value.toLocaleString()} · {d.strategy}</div>
                  </TipBox>
                ) : null;
              }}
            />
            <Scatter data={others} fill={C.neutral} stroke={C.surface} strokeWidth={2} {...ANIM} />
            <Scatter data={mine} fill={C.series1} stroke={C.surface} strokeWidth={2} {...ANIM} label={{ dataKey: "name", position: "right", fill: C.label, fontSize: 11, offset: 10 }} />
          </ScatterChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
