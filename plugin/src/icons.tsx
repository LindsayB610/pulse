import React from "react";

export function PulseIcon({ kind, size = 18 }: { kind: "check" | "refresh" | "plus"; size?: number }): React.ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {kind === "check" ? <path d="m5 12 4 4L19 6"/> : kind === "refresh" ? <><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></> : <><path d="M12 5v14"/><path d="M5 12h14"/></>}
  </svg>;
}
