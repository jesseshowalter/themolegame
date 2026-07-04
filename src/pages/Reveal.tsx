import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession, codenameFor } from '../lib/session';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import { parseMoleBrief } from '../lib/moleBriefing';

type Mole = { name: string; codename: string | null; avatar_url: string | null };

const SCRAMBLE_CHARS = '!<>-_\\/[]{}=+*^?#01ABCDEF▓▒░';
const prefersReducedMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Animate `target` in from random characters, resolving left-to-right, once
 * `active` flips true. Returns the current display string.
 */
function useScramble(target: string, active: boolean): string {
  const [out, setOut] = useState('');
  useEffect(() => {
    if (!active || !target) {
      setOut('');
      return;
    }
    const rand = () => SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
    const scrambleFrom = (revealed: number) =>
      target
        .split('')
        .map((ch, i) => (i < revealed || ch === ' ' ? ch : rand()))
        .join('');
    setOut(scrambleFrom(0));
    let frame = 0;
    const total = Math.max(target.length * 3, 20);
    const id = window.setInterval(() => {
      frame += 1;
      const revealed = Math.floor((frame / total) * target.length);
      setOut(scrambleFrom(revealed));
      if (frame >= total) {
        setOut(target);
        window.clearInterval(id);
      }
    }, 45);
    return () => window.clearInterval(id);
  }, [target, active]);
  return out;
}

/**
 * The ENDGAME reveal — shown to every player (the mole included) while the host
 * has the endgame briefing (round 99) open. Unmasks the mole with a staged
 * "declassify" animation: a redacted, scanning dossier that sharpens as the
 * name decodes from scrambled characters. Realtime bounces players to standby
 * when the host closes it.
 */
export default function Reveal() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [mole, setMole] = useState<Mole | null>(null);
  const [message, setMessage] = useState('');
  const [notes, setNotes] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  // Reveal timeline: 0 idle → 1 debrief → 2 decrypting → 3 unmask → 4 codename → 5 rest.
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (!session) {
      navigate('/play', { replace: true });
      return;
    }
    if (!isSupabaseConfigured || !quizId) return;

    (async () => {
      const { data: q } = await supabase
        .from('quizzes')
        .select('mission_status,mission_briefing')
        .eq('id', quizId)
        .maybeSingle();
      if (!q || q.mission_status !== 'open') {
        navigate('/play/wait', { replace: true });
        return;
      }
      const parsed = parseMoleBrief(q.mission_briefing);
      setMessage(parsed.description);
      setNotes(parsed.objectives);

      const { data: reveal } = await supabase.rpc('reveal_mole');
      setMole((reveal as Mole[] | null)?.[0] ?? null);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  // Drive the staged reveal once the data has loaded.
  useEffect(() => {
    if (loading) return;
    if (prefersReducedMotion || !mole) {
      setStep(5);
      return;
    }
    const timers = [
      window.setTimeout(() => setStep(1), 300), // // MISSION DEBRIEF
      window.setTimeout(() => setStep(2), 1200), // DECRYPTING + redacted dossier scans (~3.8s)
      window.setTimeout(() => setStep(3), 5000), // unmask: photo sharpens, name decodes
      window.setTimeout(() => setStep(4), 6400), // codename
      window.setTimeout(() => setStep(5), 7200), // closing message + notes
    ];
    return () => timers.forEach(window.clearTimeout);
  }, [loading, mole]);

  useEffect(() => {
    if (!isSupabaseConfigured || !quizId) return;
    const channel = supabase
      .channel(`reveal-${quizId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quizzes', filter: `id=eq.${quizId}` },
        (payload) => {
          if ((payload.new as { mission_status: string }).mission_status !== 'open')
            navigate('/play/wait', { replace: true });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const scrambled = useScramble(mole?.name ?? '', step >= 3 && !prefersReducedMotion);
  const nameText = prefersReducedMotion ? mole?.name ?? '' : scrambled;
  const rest = step >= 5; // closing message / notes / sign-off

  if (!session && isSupabaseConfigured) return null;

  return (
    <TerminalChrome agentName={session?.name} avatarUrl={session?.avatar} status="DECLASSIFIED">
      <Wordmark size={48} />
      <div className="mole-screen reveal-screen">
        <p className={`mono-label reveal-item${step >= 1 ? ' show' : ''}`}>// MISSION DEBRIEF</p>

        {loading ? (
          <p className="status-sub cursor">DECLASSIFYING</p>
        ) : mole ? (
          <>
            <p className={`reveal-status reveal-item${step === 2 ? ' show' : ''}`}>
              <span className="cursor">DECRYPTING IDENTITY</span>
            </p>
            <p className={`reveal-lead reveal-item${step >= 3 ? ' show' : ''}`}>THE MOLE WAS</p>

            <div
              className={`reveal-avatar reveal-item${step >= 2 ? ' show' : ''} ${
                step >= 3 ? 'declassified' : 'redacted'
              }${step === 2 ? ' scanning' : ''}`}
            >
              {mole.avatar_url ? (
                <img className="avatar-img" src={mole.avatar_url} alt="" />
              ) : (
                <span className="reveal-initial">
                  {step >= 3 ? mole.name[0]?.toUpperCase() ?? '?' : '?'}
                </span>
              )}
              <span className="reveal-scanline" />
              <span className="reveal-classified">CLASSIFIED</span>
            </div>

            <h2 className={`reveal-name reveal-item${step >= 3 ? ' show' : ''}`}>{nameText}</h2>
            <p className={`reveal-codename reveal-item${step >= 4 ? ' show' : ''}`}>
              {codenameFor(mole.name, mole.codename)}
            </p>
          </>
        ) : (
          <h2 className="status-headline mission-title">THE GAME IS OVER</h2>
        )}

        {message && <p className={`mole-desc reveal-item${rest ? ' show' : ''}`}>{message}</p>}

        {notes.length > 0 && (
          <ul className={`mole-tasks reveal-item${rest ? ' show' : ''}`}>
            {notes.map((t, i) => (
              <li key={i}>
                <span className="mole-task-marker">▸</span>
                {t}
              </li>
            ))}
          </ul>
        )}

        <p className={`mono-dim mole-foot reveal-item${rest ? ' show' : ''}`}>
          Thank you for playing. // END TRANSMISSION
        </p>
      </div>
    </TerminalChrome>
  );
}
