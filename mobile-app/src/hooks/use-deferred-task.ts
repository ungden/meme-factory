import { useEffect } from "react";

export function useDeferredTask(task: () => void | Promise<void>) {
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      void task();
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [task]);
}
