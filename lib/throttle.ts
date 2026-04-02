export function throttle<T extends (...args: unknown[]) => void>(
  fn: T,
  interval: number
): T {
  let lastTime = 0;
  let pending: ReturnType<typeof setTimeout> | null = null;

  const throttled = (...args: unknown[]) => {
    const now = Date.now();
    const remaining = interval - (now - lastTime);

    if (remaining <= 0) {
      if (pending) {
        clearTimeout(pending);
        pending = null;
      }
      lastTime = now;
      fn(...args);
    } else if (!pending) {
      pending = setTimeout(() => {
        lastTime = Date.now();
        pending = null;
        fn(...args);
      }, remaining);
    }
  };

  return throttled as unknown as T;
}
