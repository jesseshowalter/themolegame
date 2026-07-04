/** Sub-prize identity — spy-themed name for the eliminated players' contest. */
export const ROGUE_PRIZE = 'Rogue Agent';

/**
 * Encouragement strip shown to eliminated players while they keep playing.
 * They're out of the main game but every correct answer counts toward the
 * consolation "Rogue Agent" prize.
 */
export default function EliminatedBanner() {
  return (
    <div className="consolation-banner">
      <strong>// ELIMINATED</strong> · you're out of the main game, but keep going — the eliminated
      agent with the most correct answers wins the <strong>{ROGUE_PRIZE}</strong> prize.
    </div>
  );
}
