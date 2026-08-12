import { useEffect, useMemo, useState } from 'react';
import { getCameraView } from './logic';
import { downtownBranch } from './maps/downtownBranch';

/**
 * Phase 2 — single-player OBSERVE harness (client-only, no server).
 *
 * Pick a camera, watch ONLY that camera's masked cone for `timerSeconds`, then
 * it hides. The rest of the map is blacked out. Only the `getCameraView(...)`
 * output is ever rendered, so no other cone's objects reach the DOM. (Real
 * server-side masking — not shipping the full map to the client at all — is the
 * Phase 3 boundary; this harness is for feel + acceptance testing.)
 */

const MAP = downtownBranch;
const VIEW_W = 1000;
const VIEW_H = 720;

// Short glyph per category for the map markers.
function glyph(category: string): string {
  return (category[0] ?? '?').toUpperCase();
}

type Phase = 'idle' | 'observing' | 'hidden';

export default function ObserveHarness() {
  const [cameraId, setCameraId] = useState<string | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [remaining, setRemaining] = useState(MAP.timerSeconds);

  // The ONLY object data this component ever holds while observing.
  const view = useMemo(
    () => (cameraId ? getCameraView(MAP, cameraId) : null),
    [cameraId]
  );

  function start(id: string) {
    setCameraId(id);
    setRemaining(MAP.timerSeconds);
    setPhase('observing');
  }

  // Countdown; hides the cone when it reaches zero.
  useEffect(() => {
    if (phase !== 'observing') return;
    const startAt = Date.now();
    let raf = 0;
    const tick = () => {
      const left = Math.max(0, MAP.timerSeconds - (Date.now() - startAt) / 1000);
      setRemaining(left);
      if (left <= 0) {
        setPhase('hidden');
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [phase]);

  const pct = (remaining / MAP.timerSeconds) * 100;
  const showCone = phase === 'observing' && view;

  return (
    <div className="host surv">
      <div className="host-head">
        <div className="host-title">SURVEILLANCE // OBSERVE</div>
        <div className="host-tag">Phase 2 harness · {MAP.id}</div>
      </div>

      <p className="section-label">Select your camera</p>
      <div className="round-actions" style={{ flexWrap: 'wrap', marginBottom: 16 }}>
        {MAP.cameras.map((c) => (
          <button
            key={c.id}
            className={`btn-sm${cameraId === c.id ? ' on' : ''}`}
            style={{ flex: 'unset' }}
            disabled={phase === 'observing'}
            onClick={() => start(c.id)}
          >
            {c.label ?? c.id}
          </button>
        ))}
      </div>

      {phase === 'observing' && (
        <div className="progress" style={{ marginBottom: 12 }}>
          <p className="mono-label">
            OBSERVING {view?.label ?? cameraId} — {Math.ceil(remaining)}s
          </p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}

      <div className="surv-map">
        <svg viewBox={`0 0 ${VIEW_W} ${VIEW_H}`} className="surv-svg" role="img">
          <defs>
            <filter id="surv-blur" x="-50%" y="-50%" width="200%" height="200%">
              <feGaussianBlur stdDeviation="4" />
            </filter>
            <pattern id="surv-grid" width="40" height="40" patternUnits="userSpaceOnUse">
              <path d="M40 0H0V40" fill="none" stroke="rgba(0,255,65,0.12)" strokeWidth="1" />
            </pattern>
          </defs>

          {/* Blacked-out schematic. */}
          <rect x="0" y="0" width={VIEW_W} height={VIEW_H} fill="#020602" />

          {showCone && (
            <>
              {/* Lit cone (the only visible sightline). */}
              <polygon
                points={view!.cone.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="rgba(0,255,65,0.06)"
                stroke="var(--accent)"
                strokeWidth="2"
                style={{ filter: 'drop-shadow(0 0 10px rgba(0,255,65,0.4))' }}
              />
              <polygon
                points={view!.cone.map((p) => `${p.x},${p.y}`).join(' ')}
                fill="url(#surv-grid)"
                stroke="none"
              />

              {/* Object markers — from the masked view only. */}
              {view!.objects.map((o) => (
                <g
                  key={o.id}
                  transform={`translate(${o.x}, ${o.y})`}
                  filter={o.obscured ? 'url(#surv-blur)' : undefined}
                  opacity={o.obscured ? 0.7 : 1}
                >
                  <circle
                    r="18"
                    fill="#031003"
                    stroke="var(--accent)"
                    strokeWidth="2"
                    strokeDasharray={o.obscured ? '4 4' : undefined}
                  />
                  <text
                    textAnchor="middle"
                    dominantBaseline="central"
                    fontSize="18"
                    fontWeight="700"
                    fill="var(--accent)"
                    fontFamily="var(--font-mono)"
                  >
                    {o.obscured ? '?' : glyph(o.category)}
                  </text>
                </g>
              ))}
            </>
          )}

          {phase === 'hidden' && (
            <text
              x={VIEW_W / 2}
              y={VIEW_H / 2}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize="42"
              fontWeight="800"
              fill="var(--danger)"
              fontFamily="var(--font-display)"
              fontStyle="italic"
            >
              SIGHTLINE CLOSED
            </text>
          )}
        </svg>

        {phase === 'idle' && (
          <p className="surv-hint mono-dim">Select a camera to begin your 15-second watch.</p>
        )}
      </div>

      {phase === 'hidden' && (
        <div className="surv-recall">
          <p className="mono-label">// FROM MEMORY</p>
          <p className="mole-desc" style={{ maxWidth: 640 }}>
            How many of each did you see in your cone?{' '}
            {MAP.categories.map((c) => glyph(c)).join(' · ')} — (report + reconcile arrive in
            Phase 4.)
          </p>
          <button className="btn-sm" style={{ flex: 'unset' }} onClick={() => start(cameraId!)}>
            ⟲ Re-watch this camera
          </button>
        </div>
      )}

      <p className="setup-hint" style={{ marginTop: 20 }}>
        Legend: {MAP.categories.map((c) => `${glyph(c)} = ${c}`).join(' · ')}. Fuzzy “?” markers
        are obscured objects — hard to count on purpose.
      </p>
    </div>
  );
}
