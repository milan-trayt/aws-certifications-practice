import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { progressService, SpacedRepetitionQuestion } from '../services/progressService';
import { apiClient, handleApiError } from '../services/api';
import Discussions from './Discussions';
import { Brain, Sparkles, BookOpen, RefreshCw, CheckCircle, ImageOff, Check, X, ChevronRight, RotateCcw, MessageCircle } from 'lucide-react';
import './SpacedRepetitionMode.css';

interface SpacedRepetitionModeProps {
  testName: string;
  testId: string;
}

type MasteryLevel = 'new' | 'learning' | 'reviewing' | 'mastered';

const MASTERY_CONFIG: Record<MasteryLevel, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  new: { label: 'New', color: '#6366f1', bg: '#eef2ff', icon: <Sparkles size={14} /> },
  learning: { label: 'Learning', color: '#f59e0b', bg: '#fffbeb', icon: <BookOpen size={14} /> },
  reviewing: { label: 'Reviewing', color: '#3b82f6', bg: '#eff6ff', icon: <RefreshCw size={14} /> },
  mastered: { label: 'Mastered', color: '#22c55e', bg: '#f0fdf4', icon: <CheckCircle size={14} /> },
};

const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const SpacedRepetitionMode: React.FC<SpacedRepetitionModeProps> = ({ testName, testId }) => {
  const settingKey = `sr-index-${testId}`;
  const [questions, setQuestions] = useState<SpacedRepetitionQuestion[]>([]);
  const [shuffledQuestions, setShuffledQuestions] = useState<SpacedRepetitionQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [isAnswered, setIsAnswered] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [error, setError] = useState('');
  const [showDiscussions, setShowDiscussions] = useState(false);

  const loadQuestions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const [data, settingRes] = await Promise.all([
        progressService.getSpacedRepetitionQuestions(testId),
        apiClient.get(`/users/settings/${settingKey}`).catch(() => null),
      ]);
      setQuestions(data.questions);
      const shuffled = shuffleArray(data.questions);
      setShuffledQuestions(shuffled);
      const savedIndex = settingRes?.data?.data?.value;
      if (savedIndex != null) {
        const idx = parseInt(savedIndex, 10);
        if (!isNaN(idx) && idx >= 0 && idx < shuffled.length) {
          setCurrentIndex(idx);
        }
      }
    } catch (err: any) {
      setError(handleApiError(err));
    } finally {
      setIsLoading(false);
    }
  }, [testId, settingKey]);

  useEffect(() => {
    loadQuestions();
  }, [loadQuestions]);

  const saveIndex = useCallback((idx: number) => {
    apiClient.put(`/users/settings/${settingKey}`, { value: String(idx) }).catch(() => {});
  }, [settingKey]);

  useEffect(() => {
    if (shuffledQuestions.length > 0 && currentIndex >= shuffledQuestions.length) {
      setCurrentIndex(shuffledQuestions.length - 1);
    }
  }, [shuffledQuestions.length, currentIndex]);

  const currentQuestion = shuffledQuestions[currentIndex] || null;

  const handleAnswerClick = (choice: string) => {
    if (isAnswered) return;
    const correctAnswers = currentQuestion.correctAnswer.split('');
    const isMultiple = correctAnswers.length > 1;

    if (isMultiple) {
      setSelectedAnswers(prev =>
        prev.includes(choice) ? prev.filter(a => a !== choice) : [...prev, choice]
      );
    } else {
      setSelectedAnswers([choice]);
      submitAnswer([choice]);
    }
  };

  const handleSubmitMultiple = () => {
    submitAnswer(selectedAnswers);
  };

  const submitAnswer = async (answers: string[]) => {
    if (!currentQuestion || isAnswered) return;
    setIsAnswered(true);
    setIsSubmitting(true);

    const correctAnswers = currentQuestion.correctAnswer.split('');
    const isCorrect =
      answers.length === correctAnswers.length &&
      answers.every(a => correctAnswers.includes(a));

    try {
      const result = await progressService.updateSpacedRepetition({
        testId,
        questionId: currentQuestion.questionId,
        isCorrect,
      });
      const updateQ = (q: SpacedRepetitionQuestion) =>
        q.questionId === currentQuestion.questionId
          ? {
              ...q,
              masteryLevel: result.progress.masteryLevel as MasteryLevel,
              repetitionCount: result.progress.repetitionCount,
              intervalDays: result.progress.intervalDays,
              correctCount: result.progress.correctCount,
              incorrectCount: result.progress.incorrectCount,
            }
          : q;
      setQuestions(prev => prev.map(updateQ));
      setShuffledQuestions(prev => prev.map(updateQ));
    } catch (err: any) {
      console.error('Failed to update SR progress:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleNext = () => {
    if (currentIndex < shuffledQuestions.length - 1) {
      const next = currentIndex + 1;
      setCurrentIndex(next);
      saveIndex(next);
      setSelectedAnswers([]);
      setIsAnswered(false);
      setShowDiscussions(false);
    }
  };

  const getChoiceClass = (choice: string): string => {
    if (!isAnswered) {
      return selectedAnswers.includes(choice) ? 'sr-choice selected' : 'sr-choice';
    }
    const correctAnswers = currentQuestion.correctAnswer.split('');
    const isSelected = selectedAnswers.includes(choice);
    const isCorrectChoice = correctAnswers.includes(choice);

    if (isSelected && isCorrectChoice) return 'sr-choice correct';
    if (isSelected && !isCorrectChoice) return 'sr-choice incorrect';
    if (!isSelected && isCorrectChoice) return 'sr-choice correct-highlight';
    return 'sr-choice';
  };

  const renderTextWithImages = (text: string) => {
    const parts = text.split('//IMG//');
    return parts.map((part, index) => (
      <React.Fragment key={index}>
        {part.split('\n').map((line, i) => (
          <React.Fragment key={i}>
            {line}
            {i < part.split('\n').length - 1 && <br />}
          </React.Fragment>
        ))}
        {index < parts.length - 1 && (
          <div className="sr-missing-image"><ImageOff size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> Image not available</div>
        )}
      </React.Fragment>
    ));
  };

  const masteryCounts = questions.reduce(
    (acc, q) => {
      acc[q.masteryLevel] = (acc[q.masteryLevel] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const overallStats = useMemo(() => {
    const totalAnswered = questions.filter(q => q.correctCount > 0 || q.incorrectCount > 0).length;
    const totalCorrect = questions.reduce((sum, q) => sum + q.correctCount, 0);
    const totalIncorrect = questions.reduce((sum, q) => sum + q.incorrectCount, 0);
    const totalAttempts = totalCorrect + totalIncorrect;
    const accuracy = totalAttempts > 0 ? Math.round((totalCorrect / totalAttempts) * 100) : 0;
    return { totalAnswered, totalCorrect, totalIncorrect, totalAttempts, accuracy };
  }, [questions]);

  const handleResetProgress = async () => {
    if (!window.confirm('Are you sure you want to reset all spaced repetition progress for this test? This cannot be undone.')) return;
    setIsResetting(true);
    try {
      await apiClient.delete(`/progress/study/${testId}`);
      await loadQuestions();
      setCurrentIndex(0);
      saveIndex(0);
      setSelectedAnswers([]);
      setIsAnswered(false);
      setShowDiscussions(false);
    } catch {
      setError('Failed to reset progress. Please try again.');
    } finally {
      setIsResetting(false);
    }
  };

  if (isLoading) {
    return <div className="sr-mode"><div className="sr-loading">Loading spaced repetition data...</div></div>;
  }

  if (error) {
    return <div className="sr-mode"><div className="sr-error"><p>{error}</p><button onClick={loadQuestions} className="sr-retry-btn">Retry</button></div></div>;
  }

  if (shuffledQuestions.length === 0) {
    return <div className="sr-mode"><div className="sr-empty">No questions available for spaced repetition.</div></div>;
  }

  const correctAnswers = currentQuestion.correctAnswer.split('');
  const isMultipleAnswer = correctAnswers.length > 1;
  const mastery = MASTERY_CONFIG[currentQuestion.masteryLevel];
  const isLastQuestion = currentIndex >= shuffledQuestions.length - 1;

  return (
    <div className="sr-mode">
      <div className="sr-header">
        <h2><Brain size={20} style={{verticalAlign: 'middle', marginRight: 4}} /> {testName} - Spaced Repetition</h2>
        <button
          className="sr-reset-btn"
          onClick={handleResetProgress}
          disabled={isResetting || overallStats.totalAnswered === 0}
          title="Reset all spaced repetition progress for this test"
        >
          <RotateCcw size={14} style={{verticalAlign: 'middle', marginRight: 4}} />
          {isResetting ? 'Resetting...' : 'Reset Progress'}
        </button>
        <div className="sr-summary-bar">
          {(Object.keys(MASTERY_CONFIG) as MasteryLevel[]).map(level => (
            <span key={level} className="sr-summary-badge" style={{ color: MASTERY_CONFIG[level].color, background: MASTERY_CONFIG[level].bg }}>
              {MASTERY_CONFIG[level].icon} {MASTERY_CONFIG[level].label}: {masteryCounts[level] || 0}
            </span>
          ))}
        </div>
        {overallStats.totalAttempts > 0 && (
          <div className="sr-session-stats">
            {overallStats.totalAnswered} practiced · {overallStats.totalCorrect} correct · {overallStats.totalIncorrect} incorrect · {overallStats.accuracy}% accuracy
          </div>
        )}
      </div>

      <div className="sr-progress-indicator">
        {currentIndex + 1} of {shuffledQuestions.length}
      </div>

      <div className="sr-question-card">
        <div className="sr-question-top">
          <span className="sr-mastery-badge" style={{ color: mastery.color, background: mastery.bg }}>
            {mastery.icon} {mastery.label}
          </span>
        </div>

        <div className="sr-question-text">
          {renderTextWithImages(currentQuestion.questionText)}
        </div>

        {isMultipleAnswer && !isAnswered && (
          <div className="sr-multiple-hint">Select all correct answers</div>
        )}

        <div className="sr-choices">
          {Object.entries(currentQuestion.choices).map(([key, value]) => (
            <div
              key={key}
              className={getChoiceClass(key)}
              onClick={() => handleAnswerClick(key)}
              role="button"
              tabIndex={isAnswered ? -1 : 0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleAnswerClick(key); }}
            >
              <span className="sr-choice-label">{key}</span>
              <span className="sr-choice-text">{renderTextWithImages(value)}</span>
            </div>
          ))}
        </div>

        {isMultipleAnswer && !isAnswered && selectedAnswers.length > 0 && (
          <button className="sr-submit-btn" onClick={handleSubmitMultiple}>Submit Answer</button>
        )}

        {isAnswered && (
          <>
            <div className={`sr-feedback ${selectedAnswers.every(a => correctAnswers.includes(a)) && selectedAnswers.length === correctAnswers.length ? 'correct' : 'incorrect'}`}>
              {selectedAnswers.every(a => correctAnswers.includes(a)) && selectedAnswers.length === correctAnswers.length
                ? <><Check size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> Correct!</>
                : <><X size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> Incorrect — Correct answer: {currentQuestion.correctAnswer}</>}
              {isSubmitting && <span className="sr-saving"> Saving...</span>}
            </div>

            <div className="sr-post-answer-actions">
              {currentQuestion.discussion && currentQuestion.discussion.length > 0 && (
                <button className="sr-discussions-btn" onClick={() => setShowDiscussions(true)}>
                  <MessageCircle size={14} style={{verticalAlign: 'middle', marginRight: 4}} />
                  Discussions {currentQuestion.discussionCount ? `(${currentQuestion.discussionCount})` : ''}
                </button>
              )}
              {!isLastQuestion && (
                <button className="sr-nav-btn primary" onClick={handleNext}>
                  Next <ChevronRight size={14} style={{verticalAlign: 'middle'}} />
                </button>
              )}
              {isLastQuestion && (
                <div className="sr-complete-msg">You've reviewed all questions in this set.</div>
              )}
            </div>
          </>
        )}
      </div>

      {showDiscussions && currentQuestion && (
        <Discussions
          discussions={currentQuestion.discussion}
          discussionCount={currentQuestion.discussionCount}
          questionText={currentQuestion.questionText}
          questionNumber={currentQuestion.questionNumber}
          onClose={() => setShowDiscussions(false)}
        />
      )}
    </div>
  );
};

export default SpacedRepetitionMode;
