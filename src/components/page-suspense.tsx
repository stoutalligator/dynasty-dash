import { Suspense, ViewTransition, type ReactNode } from "react";

/**
 * Page-level Suspense with a hand-off: the skeleton fades out quickly and the content fades in,
 * instead of popping. (Cards then rise in with their own staggered CSS animation.)
 */
export function PageSuspense({ fallback, children }: { fallback: ReactNode; children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <ViewTransition exit="skeleton-out" default="none">
          {fallback}
        </ViewTransition>
      }
    >
      <ViewTransition enter="content-in" default="none">
        {children}
      </ViewTransition>
    </Suspense>
  );
}

/** CSS-safe view-transition name from React's useId(). */
export const vtName = (prefix: string, id: string) => `${prefix}-${id.replace(/[^a-zA-Z0-9_-]/g, "")}`;
