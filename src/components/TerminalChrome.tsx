import type { ReactNode } from 'react';
import { useUptime } from './useUptime';
import { codenameFor } from '../lib/session';

interface Props {
  children: ReactNode;
  /** Codename shown in the bottom-left dossier, e.g. from the session. */
  agentName?: string | null;
  agentRank?: string;
  /** Overrides the top-left status readout. */
  status?: string;
  signal?: string;
}

/**
 * Full-screen spy-terminal frame: peripheral readouts (top-left), agent dossier
 * (bottom-left), and the page content centered. Scanlines + vignette come from
 * global CSS in index.css.
 */
export default function TerminalChrome({
  children,
  agentName,
  agentRank = 'FIELD INVESTIGATOR',
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

      {codename && (
        <div className="user-dossier">
          <div className="dossier-avatar">
            <span>{codename.replace(/^AGENT_/, '').split('_')[0]?.[0] ?? '?'}</span>
          </div>
          <div className="dossier-text">
            <p className="dossier-name">{codename}</p>
            <p className="dossier-rank">RANK: {agentRank}</p>
          </div>
        </div>
      )}
    </div>
  );
}
