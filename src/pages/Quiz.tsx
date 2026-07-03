import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase, isSupabaseConfigured } from '../lib/supabase';
import { getSession } from '../lib/session';
import type { Question, Quiz as QuizRow } from '../lib/types';
import TerminalChrome from '../components/TerminalChrome';
import Wordmark from '../components/Wordmark';
import Chevron from '../components/Chevron';

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

export default function Quiz() {
  const { quizId } = useParams<{ quizId: string }>();
  const navigate = useNavigate();
  const session = getSession();

  const [quiz, setQuiz] = useState<QuizRow | null>(null);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [index, setIndex] = useState(0);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  // Load quiz, its questions (answer key hidden), and any answers already given.
  useEffect(() => {
    if (!session) {
      navigate('/play', { replace: true });
      return;
    }
    if (!isSupabaseConfigured || !quizId) return;

    (async () => {
      const { data: q } = await supabase
        .from('quizzes')
        .select('*')
        .eq('id', quizId)
        .maybeSingle();
      if (!q || q.status !== 'open') {
        navigate('/play/wait', { replace: true });
        return;
      }
      setQuiz(q);

      const { data: qs } = await supabase
        .from('public_questions')
        .select('*')
        .eq('quiz_id', quizId)
        .order('order_index');
      setQuestions((qs as Question[]) ?? []);

      const { data: rs } = await supabase
        .from('responses')
        .select('question_id, answer_index')
        .eq('quiz_id', quizId)
        .eq('player_id', session.id);
      const map: Record<string, number> = {};
      (rs ?? []).forEach((r) => (map[r.question_id] = r.answer_index));
      setAnswers(map);
      // Resume at first unanswered question.
      const firstUnanswered = (qs ?? []).findIndex((x) => map[x.id] === undefined);
      setIndex(firstUnanswered === -1 ? 0 : firstUnanswered);
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  // If the host closes the round mid-quiz, move the player on.
  useEffect(() => {
    if (!isSupabaseConfigured || !quizId) return;
    const channel = supabase
      .channel(`quiz-${quizId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'quizzes', filter: `id=eq.${quizId}` },
        (payload) => {
          const next = payload.new as QuizRow;
          if (next.status !== 'open') navigate('/play/wait', { replace: true });
        }
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizId]);

  const current = questions[index];
  const total = questions.length;
  const progressPct = useMemo(
    () => (total ? Math.round(((index + 1) / total) * 100) : 0),
    [index, total]
  );

  const select = useCallback(
    async (answerIndex: number) => {
      if (!current || !session || !quiz) return;
      setAnswers((prev) => ({ ...prev, [current.id]: answerIndex }));
      setSaving(true);
      await supabase.from('responses').upsert(
        {
          player_id: session.id,
          question_id: current.id,
          quiz_id: quiz.id,
          answer_index: answerIndex,
        },
        { onConflict: 'player_id,question_id' }
      );
      setSaving(false);
    },
    [current, session, quiz]
  );

  function next() {
    if (index + 1 < total) {
      setIndex((i) => i + 1);
    } else {
      navigate(`/play/done/${quizId}`, { replace: true });
    }
  }

  if (!session && isSupabaseConfigured) return null;

  if (loading || !current) {
    return (
      <TerminalChrome agentName={session?.name} status="DECRYPTING">
        <Wordmark size={52} />
        <p className="status-sub cursor">DECRYPTING DIRECTIVE</p>
      </TerminalChrome>
    );
  }

  const selected = answers[current.id];
  const isSingleColumn = current.type === 'tf';

  return (
    <TerminalChrome agentName={session?.name} status="TRANSMITTING">
      <div className="header">
        <Wordmark size={52} />
        <div className="progress">
          <p className="mono-label">
            Question {index + 1} of {total}
          </p>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${progressPct}%` }} />
          </div>
        </div>
      </div>

      <div className="terminal-panel">
        <span className="corner tl" />
        <span className="corner tr" />
        <span className="corner bl" />
        <span className="corner br" />

        <div className="screen-content" style={{ gap: 48 }}>
          <div className="question-block">
            <p className="question-text">{current.prompt}</p>
            {(current.meta_id || current.meta_coord) && (
              <div className="question-meta">
                {current.meta_id && <span>ID: {current.meta_id}</span>}
                {current.meta_id && current.meta_coord && <span>|</span>}
                {current.meta_coord && <span>COORD: {current.meta_coord}</span>}
              </div>
            )}
          </div>

          <div className={`answers-grid${isSingleColumn ? ' single' : ''}`}>
            {current.options.map((opt, i) => (
              <button
                key={i}
                className={`choice${selected === i ? ' selected' : ''}`}
                onClick={() => select(i)}
              >
                <span className="choice-letter">{LETTERS[i] ?? i + 1}</span>
                <span className="choice-text">{opt}</span>
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="footer">
        <button className="cta" onClick={next} disabled={selected === undefined || saving}>
          {index + 1 < total ? 'Next' : 'Transmit'}
          <Chevron />
        </button>
      </div>
    </TerminalChrome>
  );
}
