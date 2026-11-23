import { ViewTransition, type ReactNode } from "react";

/**
 * Templates re-mount on every navigation (layouts don't), so this is where the route crossfade
 * lives: the old page fades out fast, the new one fades and rises in. The shell stays still.
 */
export default function Template({ children }: { children: ReactNode }) {
  return (
    <ViewTransition enter="page-in" exit="page-out" default="none">
      <div>{children}</div>
    </ViewTransition>
  );
}
