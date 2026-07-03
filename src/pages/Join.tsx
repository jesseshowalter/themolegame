import { useMemo } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';

/**
 * Host-facing page to project on a screen at the party. Guests scan the QR to
 * land on /play and tap in. Open this on your laptop; keep it off the guest URL.
 */
export default function Join() {
  const playUrl = useMemo(() => `${window.location.origin}/play`, []);

  return (
    <TerminalChrome status="BROADCASTING">
      <Wordmark size={56} />
      <div className="qr-wrap">
        <p className="mono-label">// SCAN TO ENTER THE FIELD</p>
        <div className="qr-card">
          <QRCodeSVG value={playUrl} size={260} level="M" marginSize={0} />
        </div>
        <p className="qr-url">{playUrl}</p>
        <p className="status-sub">Point your camera here to receive your assignment</p>
      </div>
    </TerminalChrome>
  );
}
