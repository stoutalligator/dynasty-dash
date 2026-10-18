import Link from "next/link";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-md py-16 text-center">
      <h2 className="text-lg font-semibold text-ink">Not found</h2>
      <p className="mt-2 text-sm text-ink-3">That team or page doesn&apos;t exist in this league.</p>
      <Link href="/league" className="mt-4 inline-block text-sm text-accent hover:underline">
        Back to the league
      </Link>
    </div>
  );
}
