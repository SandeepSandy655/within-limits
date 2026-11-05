import { useEffect, useState } from 'react';

// Make freshness an explicit reactive input, including when no new GPS fix arrives.
export function useNow(refreshOn?: unknown) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const refresh = () => setNow(Date.now());
    // A newly received fix can be newer than the last clock tick. Recheck it immediately.
    const immediate = setTimeout(refresh, 0);
    const timer = setInterval(refresh, 15_000);
    return () => { clearTimeout(immediate); clearInterval(timer); };
  }, [refreshOn]);
  return now;
}
