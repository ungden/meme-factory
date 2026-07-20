"use client";

import { useEffect } from "react";

/**
 * Runs a memoized task after the effect has committed.
 *
 * This is intended for client-side loaders that synchronously enter a loading
 * state before awaiting network I/O. Deferring one tick avoids cascading state
 * updates during the effect body and gives us a cancellable cleanup point.
 */
export function useDeferredTask(task: () => void | Promise<void>) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void task();
    }, 0);

    return () => window.clearTimeout(timeoutId);
  }, [task]);
}
