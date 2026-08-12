import { Navigate, Route, Routes } from 'react-router-dom';
import PlayLogin from './pages/PlayLogin';
import WaitRoom from './pages/WaitRoom';
import Quiz from './pages/Quiz';
import Done from './pages/Done';
import MoleBriefing from './pages/MoleBriefing';
import MissionBriefing from './pages/MissionBriefing';
import IntroBriefing from './pages/IntroBriefing';
import FinalBriefing from './pages/FinalBriefing';
import Reveal from './pages/Reveal';
import Host from './pages/Host';
import Join from './pages/Join';
import ObserveHarness from './games/surveillance/ObserveHarness';

export default function App() {
  return (
    <Routes>
      {/* QR code points here — instant login portal */}
      <Route path="/" element={<Navigate to="/play" replace />} />
      <Route path="/play" element={<PlayLogin />} />
      <Route path="/play/wait" element={<WaitRoom />} />
      <Route path="/play/quiz/:quizId" element={<Quiz />} />
      <Route path="/play/mission/:quizId" element={<MissionBriefing />} />
      <Route path="/play/intro/:quizId" element={<IntroBriefing />} />
      <Route path="/play/final/:quizId" element={<FinalBriefing />} />
      <Route path="/play/reveal/:quizId" element={<Reveal />} />
      <Route path="/play/mole/:quizId" element={<MoleBriefing />} />
      <Route path="/play/done/:quizId" element={<Done />} />

      {/* Surveillance game — Phase 2 observe harness (dev) */}
      <Route path="/surveillance" element={<ObserveHarness />} />

      {/* Host-only */}
      <Route path="/host" element={<Host />} />
      <Route path="/join" element={<Join />} />

      <Route path="*" element={<Navigate to="/play" replace />} />
    </Routes>
  );
}
