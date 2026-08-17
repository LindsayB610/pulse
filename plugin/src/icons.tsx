import React from "react";

export type PulseIconKind = "arrow-left" | "bell" | "check" | "copy" | "external" | "plus" | "refresh";

export function PulseIcon({ kind, size = 18 }: { kind: PulseIconKind; size?: number }): React.ReactElement {
  return <svg aria-hidden="true" viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
    {kind === "arrow-left" && <><path d="m15 18-6-6 6-6"/><path d="M9 12h10"/></>}
    {kind === "bell" && <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"/><path d="M10 21h4"/></>}
    {kind === "check" && <path d="m5 12 4 4L19 6"/>}
    {kind === "copy" && <><rect x="9" y="9" width="10" height="10" rx="2"/><path d="M15 9V7a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/></>}
    {kind === "external" && <><path d="M14 5h5v5"/><path d="m10 14 9-9"/><path d="M19 13v6H5V5h6"/></>}
    {kind === "plus" && <><path d="M12 5v14"/><path d="M5 12h14"/></>}
    {kind === "refresh" && <><path d="M20 11a8 8 0 1 0 2 5"/><path d="M20 4v7h-7"/></>}
  </svg>;
}
