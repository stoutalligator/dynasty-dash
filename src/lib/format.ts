export const fmtInt = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"));

export const fmtPts = (n: number | null | undefined, d = 1) => (n == null ? "—" : n.toFixed(d));

export const fmtSigned = (n: number, d = 1) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(n).toFixed(d)}`;

export const fmtSignedInt = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : "±"}${Math.abs(Math.round(n)).toLocaleString("en-US")}`;

/** Compact value: 12,840 → 12.8K. */
export const fmtCompact = (n: number | null | undefined) =>
  n == null ? "—" : Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(n);

export const fmtAge = (a: number | null | undefined) => (a == null ? "—" : a.toFixed(1));

export function fmtRelative(iso: string, now: number = Date.now()): string {
  const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h} hr ago`;
  return `${Math.round(h / 24)} days ago`;
}

export const fmtDateTime = (iso: string | number) =>
  new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

export const record = (w: number, l: number, t: number) => `${w}-${l}${t ? `-${t}` : ""}`;

export { ordinal } from "@/lib/league/picks";
