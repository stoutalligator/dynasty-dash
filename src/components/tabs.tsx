"use client";

import clsx from "clsx";
import { Children, useState, useSyncExternalStore, type ReactNode } from "react";

const subscribeHash = (cb: () => void) => {
  window.addEventListener("hashchange", cb);
  return () => window.removeEventListener("hashchange", cb);
};

/** Accessible tabs; panels are rendered on the server and passed in as children. Deep-linkable via #key. */
export function Tabs({ tabs, children, initial, className }: { tabs: { key: string; label: string }[]; children: ReactNode; initial?: string; className?: string }) {
  const hash = useSyncExternalStore(subscribeHash, () => window.location.hash.slice(1), () => "");
  const [picked, setPicked] = useState<string | null>(null);
  const fromHash = tabs.some((t) => t.key === hash) ? hash : null;
  const active = picked ?? fromHash ?? initial ?? tabs[0]?.key;
  const panels = Children.toArray(children);
  return (
    <div className={className}>
      <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-line">
        {tabs.map((t) => (
          <button
            key={t.key}
            id={`tab-${t.key}`}
            role="tab"
            type="button"
            aria-selected={active === t.key}
            aria-controls={`panel-${t.key}`}
            onClick={() => {
              setPicked(t.key);
              history.replaceState(null, "", `#${t.key}`);
            }}
            className={clsx("-mb-px shrink-0 border-b-2 px-3 py-2 text-sm transition", active === t.key ? "border-accent font-medium text-ink" : "border-transparent text-ink-3 hover:text-ink-2")}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tabs.map((t, i) => (
        <div key={t.key} id={`panel-${t.key}`} role="tabpanel" aria-labelledby={`tab-${t.key}`} hidden={active !== t.key}>
          {panels[i]}
        </div>
      ))}
    </div>
  );
}
