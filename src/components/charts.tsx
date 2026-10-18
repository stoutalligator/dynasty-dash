"use client";

import { CartesianGrid, Label, Line, LineChart, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";

/* Chart tokens: validated series colors on the dark surface; text never wears series color. */
const C = {
  series1: "#3987e5",
  neutral: "#7486a3",
  grid: "#233150",
  axis: "#7486a3",
  surface: "#121a2b",
};

function TipBox({ children }: { children: React.ReactNode }) {
  return <div className="rounded-md border border-line-strong bg-surface-3 px-2.5 py-2 text-xs text-ink shadow-xl">{children}</div>;
}

export type WeeklyPoint = { week: string; mine: number | null; median: number; opponent: number | null; result: string | null };

/** My weekly score vs. the league median (the median is a reference, drawn in neutral gray). */
export function WeeklyScoreChart({ data, teamName }: { data: WeeklyPoint[]; teamName: string }) {
  return (
    <div className="h-64 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 24, bottom: 4, left: -8 }}>
          <CartesianGrid stroke={C.grid} vertical={false} />
          <XAxis dataKey="week" tick={{ fill: C.axis, fontSize: 11 }} axisLine={{ stroke: C.grid }} tickLine={false} />
          <YAxis tick={{ fill: C.axis, fontSize: 11 }} axisLine={false} tickLine={false} width={44} />
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
          <Line type="monotone" dataKey="median" stroke={C.neutral} strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line type="monotone" dataKey="mine" stroke={C.series1} strokeWidth={2} dot={{ r: 4, fill: C.series1, stroke: C.surface, strokeWidth: 2 }} activeDot={{ r: 6, stroke: C.surface, strokeWidth: 2 }} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export type AgeValuePoint = { name: string; age: number; value: number; mine: boolean; strategy: string };

/** Each team's value-weighted age vs. total asset value. My team is the only highlighted mark. */
export function AgeValueChart({ data }: { data: AgeValuePoint[] }) {
  const others = data.filter((d) => !d.mine);
  const mine = data.filter((d) => d.mine);
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer>
        <ScatterChart margin={{ top: 16, right: 24, bottom: 24, left: 8 }}>
          <CartesianGrid stroke={C.grid} />
          <XAxis type="number" dataKey="age" domain={["dataMin - 0.5", "dataMax + 0.5"]} tick={{ fill: C.axis, fontSize: 11 }} tickFormatter={(v: number) => v.toFixed(1)} axisLine={{ stroke: C.grid }} tickLine={false}>
            <Label value="Value-weighted age (younger ←)" position="bottom" offset={6} fill={C.axis} fontSize={11} />
          </XAxis>
          <YAxis type="number" dataKey="value" tick={{ fill: C.axis, fontSize: 11 }} tickFormatter={(v: number) => `${Math.round(v / 1000)}K`} axisLine={false} tickLine={false} width={44} />
          <ZAxis range={[90, 90]} />
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
          <Scatter data={others} fill={C.neutral} stroke={C.surface} strokeWidth={2} isAnimationActive={false} />
          <Scatter
            data={mine}
            fill={C.series1}
            stroke={C.surface}
            strokeWidth={2}
            isAnimationActive={false}
            label={{ dataKey: "name", position: "top", fill: "#e8edf6", fontSize: 11, offset: 10 }}
          />
        </ScatterChart>
      </ResponsiveContainer>
    </div>
  );
}
