import { useEffect, useState } from 'react';

/** Ticking HH:MM:SS since the component mounted — pure terminal flavor. */
export function useUptime(): string {
  const [start] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const secs = Math.floor((now - start) / 1000);
  const hh = String(Math.floor(secs / 3600)).padStart(2, '0');
  const mm = String(Math.floor((secs % 3600) / 60)).padStart(2, '0');
  const ss = String(secs % 60).padStart(2, '0');
  return `${hh}:${mm}:${ss}`;
}
