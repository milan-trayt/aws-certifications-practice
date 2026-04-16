import React, { useState, useEffect, useCallback } from 'react';
import { Question, TestMetadata } from '../types';
import { progressService } from '../services/progressService';
import { testService } from '../services/testService';
import { useAuth } from '../contexts/AuthContext';
import { PASSING_SCORE_DEFAULT, SCALED_SCORE_MIN, SCALED_SCORE_MAX } from '../constants';
import ExamNDAScreen from './ExamNDAScreen';
import ExamActiveScreen from './ExamActiveScreen';
import ExamReviewScreen from './ExamReviewScreen';
import ExamResultsScreen from './ExamResultsScreen';
import ExamDetailedReview from './ExamDetailedReview';
import './FullMockTest.css';

interface ShuffledChoice {
  key: string;
  value: string;
}

interface TestAnswer {
  questionIndex: number;
  selectedAnswers: string[];
  isCorrect: boolean;
  question: Question;
  shuffledChoices: ShuffledChoice[];
}

type ExamPhase = 'loading' | 'nda' | 'active' | 'review-screen' | 'results' | 'detailed-review';

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const FullMockTest: React.FC = () => {
  const { user } = useAuth();
  const [phase, setPhase] = useState<ExamPhase>('loading');
  const [testMeta, setTestMeta] = useState<TestMetadata | null>(null);
  const [allQuestions, setAllQuestions] = useState<Question[]>([]);
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState<TestAnswer[]>([]);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0);
  const [shuffledChoicesMap, setShuffledChoicesMap] = useState<Record<number, ShuffledChoice[]>>({});
  const [testStartTime, setTestStartTime] = useState<number>(0);
  const [isSavingResults, setIsSavingResults] = useState(false);
  const [reviewFilter, setReviewFilter] = useState<'all' | 'incomplete' | 'flagged'>('all');
  const [loadError, setLoadError] = useState('');
  const [colorScheme, setColorScheme] = useState('pv-scheme-black-on-white');
  const [cameFromReview, setCameFromReview] = useState(false);

  const testId = window.location.pathname.split('/full-mock/')[1] || '';

  useEffect(() => {
    const loadData = async () => {
      try {
        setLoadError('');
        const [testRes, questionsRes] = await Promise.all([
          testService.getTest(testId),
          testService.getAllQuestions(testId),
        ]);
        setTestMeta(testRes.test);
        const valid = testService.filterValidQuestions(questionsRes.questions);
        setAllQuestions(valid);
        setPhase('nda');
      } catch (e: any) {
        console.error('Failed to load exam data:', e);
        setLoadError('Failed to load exam. Please close this tab and try again.');
      }
    };
    if (testId) loadData();
  }, [testId]);

  const getExamConfig = useCallback(() => {
    if (!testMeta) return { questionCount: 65, timeLimitSec: 130 * 60, passingScore: PASSING_SCORE_DEFAULT };
    const qCount = Math.min(testMeta.totalQuestions, allQuestions.length);
    let questionCount: number;
    let timeLimitMin: number;
    if (testMeta.difficulty === 'Professional') {
      questionCount = Math.min(75, qCount);
      timeLimitMin = 180;
    } else if (testMeta.difficulty === 'Foundational') {
      questionCount = Math.min(65, qCount);
      timeLimitMin = 90;
    } else {
      questionCount = Math.min(65, qCount);
      timeLimitMin = 130;
    }
    return { questionCount, timeLimitSec: timeLimitMin * 60, passingScore: testMeta.passingScore };
  }, [testMeta, allQuestions]);

  const formatTime = (seconds: number) => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const formatTimeLimit = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m} minutes`;
  };

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (phase === 'active' || phase === 'review-screen') {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'active' && phase !== 'review-screen') return;
    if (timeLeft <= 0) { completeTest(); return; }
    const timer = setTimeout(() => setTimeLeft(t => t - 1), 1000);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, timeLeft]);

  const startExam = () => {
    const { questionCount, timeLimitSec } = getExamConfig();
    const shuffled = shuffleArray(allQuestions);
    const selected = shuffled.slice(0, questionCount);
    setTestQuestions(selected);

    const choicesMap: Record<number, ShuffledChoice[]> = {};
    selected.forEach((q, i) => {
      const entries = Object.entries(q.choices)
        .filter(([, v]) => v.trim().length > 0)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => ({ key: k, value: v }));
      choicesMap[i] = entries;
    });
    setShuffledChoicesMap(choicesMap);
    setCurrentQuestionIndex(0);
    setTestAnswers([]);
    setFlaggedQuestions(new Set());
    setTimeLeft(timeLimitSec);
    setPhase('active');
    setTestStartTime(Date.now());
  };

  const handleAnswer = (selectedAnswers: string[]) => {
    const q = testQuestions[currentQuestionIndex];
    const correct = q.correct_answer.split('');
    const isCorrect = selectedAnswers.length === correct.length &&
      selectedAnswers.every(a => correct.includes(a));
    const answer: TestAnswer = {
      questionIndex: currentQuestionIndex, selectedAnswers, isCorrect,
      question: q, shuffledChoices: shuffledChoicesMap[currentQuestionIndex],
    };
    setTestAnswers(prev => { const u = [...prev]; u[currentQuestionIndex] = answer; return u; });
  };

  const toggleFlag = () => {
    setFlaggedQuestions(prev => {
      const s = new Set(prev);
      s.has(currentQuestionIndex) ? s.delete(currentQuestionIndex) : s.add(currentQuestionIndex);
      return s;
    });
  };

  const goNext = () => { if (currentQuestionIndex < testQuestions.length - 1) setCurrentQuestionIndex(i => i + 1); };
  const goPrev = () => { if (currentQuestionIndex > 0) setCurrentQuestionIndex(i => i - 1); };
  const goToQuestion = (idx: number) => {
    if (idx >= 0 && idx < testQuestions.length) {
      setCurrentQuestionIndex(idx);
      if (phase === 'review-screen') {
        setCameFromReview(true);
        setPhase('active');
      }
    }
  };

  const completeTest = async () => {
    setPhase('results');
    setIsSavingResults(true);
    try {
      const correct = testAnswers.filter(a => a?.isCorrect).length;
      const total = testQuestions.length;
      const timeSpent = Math.floor((Date.now() - testStartTime) / 1000);
      const answersData = testQuestions.map((q, i) => {
        const a = testAnswers[i];
        return {
          questionId: q.question_id,
          userAnswer: a?.selectedAnswers.length ? a.selectedAnswers.join('') : 'SKIPPED',
          isCorrect: a?.isCorrect ?? false,
          timeTaken: Math.floor(timeSpent / total),
        };
      });
      await progressService.saveMockTestResults({ testId, score: correct, totalQuestions: total, timeSpent, answers: answersData });
    } catch (e) { console.error('Error saving:', e); }
    finally { setIsSavingResults(false); }
  };

  const calculateScore = () => {
    const correct = testAnswers.filter(a => a?.isCorrect).length;
    const total = testQuestions.length;
    const pct = Math.round((correct / total) * 100);
    const scaled = Math.round(SCALED_SCORE_MIN + (pct / 100) * (SCALED_SCORE_MAX - SCALED_SCORE_MIN));
    const { passingScore } = getExamConfig();
    return { correct, total, percentage: pct, scaled, passed: scaled >= passingScore, passingScore };
  };

  const renderTextWithImages = (text: string, images: string[] = []) => {
    const parts = text.split('//IMG//');
    const result: React.ReactNode[] = [];
    parts.forEach((part, index) => {
      if (part) {
        result.push(
          <span key={`t-${index}`}>
            {part.split('\n').map((line, li) => (
              <React.Fragment key={li}>{line}{li < part.split('\n').length - 1 && <br />}</React.Fragment>
            ))}
          </span>
        );
      }
      if (index < parts.length - 1) {
        if (images[index]) {
          result.push(
            <div key={`img-${index}`} className="pv-image-container">
              <img src={images[index]} alt={`Image ${index + 1}`} className="pv-image"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
            </div>
          );
        } else {
          result.push(<div key={`ph-${index}`} className="pv-missing-image">Image not available</div>);
        }
      }
    });
    return result;
  };

  const handleChoiceClick = (key: string) => {
    const currentQ = testQuestions[currentQuestionIndex];
    const correctAnswers = currentQ.correct_answer.split('');
    const isMultiple = correctAnswers.length > 1;
    const selected = testAnswers[currentQuestionIndex]?.selectedAnswers || [];
    if (isMultiple) {
      const updated = selected.includes(key) ? selected.filter(a => a !== key) : [...selected, key];
      handleAnswer(updated);
    } else {
      handleAnswer([key]);
    }
  };

  const answeredCount = testAnswers.filter(a => a?.selectedAnswers.length > 0).length;
  const unansweredCount = testQuestions.length - answeredCount;
  const flaggedCount = flaggedQuestions.size;
  const testName = testMeta?.name || 'AWS Certification Exam';

  // ─── Loading ───
  if (phase === 'loading') {
    return (
      <div className={`pv-fullscreen ${colorScheme}`}>
        <div className="pv-header">
          <div className="pv-header-left">Loading...</div>
          <div className="pv-header-right" />
        </div>
        <div className="pv-center-screen">
          {loadError ? (
            <div className="pv-load-error">
              <p>{loadError}</p>
              <button className="pv-btn pv-btn-secondary" onClick={() => window.close()}>Close Tab</button>
            </div>
          ) : (
            <div className="pv-loading-exam">
              <div className="pv-loading-spinner" />
              <p>Loading exam...</p>
            </div>
          )}
        </div>
        <div className="pv-footer">
          <div className="pv-footer-left" />
          <div className="pv-footer-right" />
        </div>
      </div>
    );
  }

  // ─── NDA Screen ───
  if (phase === 'nda') {
    const { questionCount, timeLimitSec, passingScore } = getExamConfig();
    return (
      <ExamNDAScreen
        testName={testName}
        questionCount={questionCount}
        timeLimitSec={timeLimitSec}
        passingScore={passingScore}
        onStart={startExam}
        onCancel={() => window.close()}
        formatTimeLimit={formatTimeLimit}
        colorScheme={colorScheme}
        onColorSchemeChange={setColorScheme}
      />
    );
  }

  // ─── Review Screen ───
  if (phase === 'review-screen') {
    return (
      <ExamReviewScreen
        testName={testName}
        totalQuestions={testQuestions.length}
        answeredCount={answeredCount}
        unansweredCount={unansweredCount}
        flaggedCount={flaggedCount}
        timeLeft={timeLeft}
        reviewFilter={reviewFilter}
        testAnswers={testAnswers}
        flaggedQuestions={flaggedQuestions}
        formatTime={formatTime}
        onFilterChange={setReviewFilter}
        onGoToQuestion={goToQuestion}
        onReturnToExam={() => setPhase('active')}
        onEndExam={completeTest}
        colorScheme={colorScheme}
        onColorSchemeChange={setColorScheme}
      />
    );
  }

  // ─── Results ───
  if (phase === 'results') {
    return (
      <ExamResultsScreen
        score={calculateScore()}
        unansweredCount={unansweredCount}
        flaggedCount={flaggedCount}
        isSavingResults={isSavingResults}
        onReviewAnswers={() => setPhase('detailed-review')}
        onClose={() => window.close()}
        colorScheme={colorScheme}
      />
    );
  }

  // ─── Detailed Review ───
  if (phase === 'detailed-review') {
    return (
      <ExamDetailedReview
        testQuestions={testQuestions}
        testAnswers={testAnswers}
        shuffledChoicesMap={shuffledChoicesMap}
        renderTextWithImages={renderTextWithImages}
        onBackToResults={() => setPhase('results')}
        colorScheme={colorScheme}
      />
    );
  }

  // ─── Active Exam ───
  const currentQ = testQuestions[currentQuestionIndex];
  if (!currentQ) return null;

  const selected = testAnswers[currentQuestionIndex]?.selectedAnswers || [];
  const isFlagged = flaggedQuestions.has(currentQuestionIndex);
  const choices = shuffledChoicesMap[currentQuestionIndex] || [];

  return (
    <ExamActiveScreen
      testName={testName}
      currentQuestionIndex={currentQuestionIndex}
      totalQuestions={testQuestions.length}
      currentQuestion={currentQ}
      choices={choices}
      selectedAnswers={selected}
      isFlagged={isFlagged}
      timeLeft={timeLeft}
      formatTime={formatTime}
      renderTextWithImages={renderTextWithImages}
      onChoiceClick={handleChoiceClick}
      onNext={goNext}
      onPrev={goPrev}
      onToggleFlag={toggleFlag}
      onReview={() => setPhase('review-screen')}
      colorScheme={colorScheme}
      onColorSchemeChange={setColorScheme}
      cameFromReview={cameFromReview}
      onReturnToReview={() => { setCameFromReview(false); setPhase('review-screen'); }}
    />
  );
};

export default FullMockTest;
