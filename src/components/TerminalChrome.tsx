import type { ReactNode } from 'react';
import { useUptime } from './useUptime';
import { codenameFor } from '../lib/session';

interface Props {
  children: ReactNode;
  /** Player name shown in the bottom-left dossier, e.g. from the session. */
  agentName?: string | null;
  /** Player's avatar (data URL) shown in the dossier; falls back to a monogram. */
  avatarUrl?: string | null;
  /** Overrides the top-left status readout. */
  status?: string;
  signal?: string;
}

/**
 * Full-screen spy-terminal frame: peripheral readouts (top-left), agent dossier
 * (bottom-left, confirming who's logged in), and the page content centered.
 * Scanlines + vignette come from global CSS in index.css.
 */
export default function TerminalChrome({
  children,
  agentName,
  avatarUrl,
  status = 'SYSTEM ARMED',
  signal = 'ENCRYPTED',
}: Props) {
  const uptime = useUptime();
  const codename = agentName ? codenameFor(agentName) : null;

  return (
    <div className="screen">
      <div className="peripheral-data">
        <p>STATUS: {status}</p>
        <p>SIGNAL: {signal}</p>
        <p>UPTIME: {uptime}</p>
      </div>

      <div className="screen-content">{children}</div>

      {agentName && (
        <div className="user-dossier">
          <div className="dossier-avatar">
            {avatarUrl ? (
              <img className="avatar-img" src={avatarUrl} alt="" />
            ) : (
              <span>{agentName.trim()[0]?.toUpperCase() ?? '?'}</span>
            )}
          </div>
          <div className="dossier-text">
            <p className="dossier-name">{agentName}</p>
            <p className="dossier-rank">{codename}</p>
          </div>
        </div>
      )}
    </div>
  );
}
