import clsx from "clsx";
import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DigestActions } from "@/components/digest-actions";
import { PageSkeleton } from "@/components/page-skeleton";
import { Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { getConfig } from "@/lib/config";
import { readDigestHistory, readLatestDigest } from "@/lib/digest/run";
import { fmtDateTime } from "@/lib/format";

export const metadata: Metadata = { title: "Weekly digest" };

async function DigestContent() {
  await connection();
  const c = getConfig();
  const [digest, history] = await Promise.all([readLatestDigest(), readDigestHistory()]);
  const channels = [c.digestWebhookUrl ? "webhook" : null, c.ntfyTopic ? `ntfy (${c.ntfyTopic})` : null].filter(Boolean);
  return (
    <>
      <PageTitle title="Weekly digest" subtitle="Waiver fits, injuries, trade ideas and league changes, compared with the previous digest">
        <DigestActions canDeliver={channels.length > 0} />
      </PageTitle>
      <div className="mb-5">
        <Notice level="info">
          Scheduled every Tuesday (see vercel.json). Delivery: {channels.length ? channels.join(" and ") : "none configured. Set DIGEST_WEBHOOK_URL (Discord or Slack) or NTFY_TOPIC to get it on your phone"}.
        </Notice>
      </div>
      {!digest ? (
        <Card>
          <p className="px-4 py-10 text-center text-sm text-ink-3">No digest yet. Use “Build now” to create the first one.</p>
        </Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-3">
          <div className="space-y-5 xl:col-span-2">
            <Card>
              <CardHeader title={`Week ${digest.week ?? "?"}: ${digest.team}`} subtitle={`Built ${fmtDateTime(digest.generatedAt)}`} />
              <p className="px-4 pb-4 text-[15px] text-ink">{digest.headline}</p>
            </Card>
            {digest.sections.map((s) => (
              <Card key={s.key}>
                <CardHeader title={s.title} />
                {s.items.length ? (
                  <ul className="divide-y divide-line/60 px-4 pb-2">
                    {s.items.map((i, k) => (
                      <li key={k} className="py-2.5">
                        <div className="flex items-start gap-2 text-sm text-ink">
                          {i.tag === "new" && <span className="mt-0.5 rounded bg-brand-amber/15 px-1.5 text-[10px] font-bold uppercase text-brand-amber">New</span>}
                          <span>{i.title}</span>
                        </div>
                        {i.detail && <p className="mt-0.5 text-[12.5px] text-ink-2">{i.detail}</p>}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="px-4 pb-4 text-sm text-ink-3">{s.empty}</p>
                )}
              </Card>
            ))}
          </div>
          <Card>
            <CardHeader title="Previous digests" />
            <ul className="divide-y divide-line/60 px-4 pb-2">
              {history.map((h, i) => (
                <li key={h.generatedAt} className={clsx("py-2 text-[13px]", i === 0 ? "text-ink" : "text-ink-2")}>
                  <div className="text-[11px] text-ink-3">Week {h.week ?? "?"} · {fmtDateTime(h.generatedAt)}</div>
                  {h.headline}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      )}
    </>
  );
}

export default function Page() {
  return (
    <Suspense fallback={<PageSkeleton tiles={0} />}>
      <DigestContent />
    </Suspense>
  );
}
