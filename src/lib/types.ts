/**
 * Hand-written types mirroring supabase/schema.sql.
 * If you later run `supabase gen types`, you can replace this file.
 *
 * NOTE: these are `type` aliases (not `interface`) on purpose — supabase-js
 * requires each table Row to satisfy `Record<string, unknown>`, and only type
 * aliases get the implicit index signature that makes that check pass.
 */

export type QuizStatus = 'locked' | 'open' | 'closed';
export type QuestionType = 'mc' | 'tf';

export type Player = {
  id: string;
  name: string;
  codename: string | null;
  avatar_url: string | null;
  is_eliminated: boolean;
  has_password: boolean;
  joined_at: string | null;
  created_at: string;
};

export type Quiz = {
  id: string;
  round_number: number;
  title: string;
  subtitle: string | null;
  status: QuizStatus; // the quiz phase
  mission_status: QuizStatus; // the mission/challenge phase
  mission_briefing: string; // public briefing shown when the mission is open
  created_at: string;
};

export type Question = {
  id: string;
  quiz_id: string;
  order_index: number;
  prompt: string;
  type: QuestionType;
  options: string[]; // jsonb array of choice labels
  correct_index: number; // index into options
  points: number;
  meta_id: string | null; // e.g. "MOLE-X-032"
  meta_coord: string | null; // e.g. "52.3702° N, 4.8952° E"
};

export type Response = {
  id: string;
  player_id: string;
  question_id: string;
  quiz_id: string;
  answer_index: number;
  is_correct: boolean;
  answered_at: string;
};

/** Row shape returned by the leaderboard view. */
export type LeaderboardRow = {
  player_id: string;
  name: string;
  codename: string | null;
  is_eliminated: boolean;
  quiz_id: string;
  round_number: number;
  answered_count: number;
  correct_count: number;
  score: number;
};

export type Database = {
  public: {
    Tables: {
      players: {
        Row: Player;
        Insert: Partial<Player> & { name: string };
        Update: Partial<Player>;
        Relationships: [];
      };
      quizzes: {
        Row: Quiz;
        Insert: Partial<Quiz> & { round_number: number; title: string };
        Update: Partial<Quiz>;
        Relationships: [];
      };
      questions: {
        Row: Question;
        Insert: Partial<Question> & {
          quiz_id: string;
          prompt: string;
          options: string[];
          correct_index: number;
        };
        Update: Partial<Question>;
        Relationships: [];
      };
      responses: {
        Row: Response;
        Insert: Partial<Response> & {
          player_id: string;
          question_id: string;
          quiz_id: string;
          answer_index: number;
        };
        Update: Partial<Response>;
        Relationships: [];
      };
    };
    Views: {
      // Player-facing question feed without the answer key.
      public_questions: { Row: Omit<Question, 'correct_index'>; Relationships: [] };
      leaderboard: { Row: LeaderboardRow; Relationships: [] };
    };
    Functions: {
      // Handler-only reader — returns full questions incl. the answer key when
      // the caller supplies the host passcode.
      admin_questions: {
        Args: { p_passcode: string; p_quiz: string };
        Returns: Question[];
      };
      // Mole feature (secrets live in RLS-locked tables, reached via these fns).
      admin_get_mole: { Args: { p_passcode: string }; Returns: string | null };
      admin_set_mole: {
        Args: { p_passcode: string; p_player: string | null };
        Returns: undefined;
      };
      admin_get_mole_briefing: {
        Args: { p_passcode: string; p_quiz: string };
        Returns: string;
      };
      admin_set_mole_briefing: {
        Args: { p_passcode: string; p_quiz: string; p_body: string };
        Returns: undefined;
      };
      mole_check: { Args: { p_player: string }; Returns: boolean };
      mole_briefing: { Args: { p_player: string; p_quiz: string }; Returns: string | null };
      // Per-player login passwords.
      admin_set_password: {
        Args: { p_passcode: string; p_player: string; p_password: string };
        Returns: undefined;
      };
      admin_get_password: { Args: { p_passcode: string; p_player: string }; Returns: string | null };
      verify_password: { Args: { p_player: string; p_password: string }; Returns: boolean };
    };
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
