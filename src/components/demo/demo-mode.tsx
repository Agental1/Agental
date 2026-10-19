"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";

/**
 * `?demo` — a scripted ~35-second tour of the public site, for screen
 * recording (weekly program updates, pitch videos). Open
 * `/talents?demo`, start the recorder, click once.
 *
 * This gate is all that ships to normal visitors: the player and its script
 * are a separate chunk, loaded only when the query parameter is present.
 *
 * The URL is read through useSyncExternalStore rather than useSearchParams:
 * useSearchParams in the root layout would force a Suspense boundary around
 * every page and opt them out of static rendering. The server snapshot is
 * `false`, so the markup hydrates identically and the player mounts right
 * after. The parameter is read once — the player owns the session from there,
 * including client-side navigations that drop the query string.
 */
const DemoPlayer = dynamic(() => import("./demo-player"), { ssr: false });

const noSubscribe = () => () => {};
// Latched: once seen, it stays on until a full page load (which is how the
// player exits), so a re-render after router.push cannot unmount the tour.
let requestedOnce = false;
const readDemoFlag = () =>
  (requestedOnce ||= new URLSearchParams(window.location.search).has("demo"));

export function DemoMode() {
  const requested = useSyncExternalStore(noSubscribe, readDemoFlag, () => false);
  return requested ? <DemoPlayer /> : null;
}
