import React from 'react';
import { Timer, Flag } from 'lucide-react';
import './FullMockTest.css';

interface TestAnswer {
  questionIndex: number;
  selectedAnswers: string[];
  isCorrect: boolean;
}

interface ExamReviewScreenProps {
  testName: string;
  totalQuestions: number;
  answeredCount: number;
  unansweredCount: number;
  flaggedCount: number;
  timeLeft: number;
  reviewFilter: 'all' | 'incomplete' | 'flagged';
  testAnswers: (TestAnswer | undefined)[];
  flaggedQuestions: Set<number>;
  formatTime: (seconds: number) => string;
  onFilterChange: (filter: 'all' | 'incomplete' | 'flagged') => void;
  onGoToQuestion: (index: number) => void;
  onReturnToExam: () => void;
  onEndExam: () => void;
}

const ExamReviewScreen: React.FC<ExamReviewScreenProps> = ({
  testName,
  totalQuestions,
  answeredCount,
  unansweredCount,
  flaggedCount,
  timeLeft,
  reviewFilter,
  testAnswers,
  flaggedQuestions,
  formatTime,
  onFilterChange,
  onGoToQuestion,
  onReturnToExam,
  onEndExam,
}) => {
  const getFiltered = () => {
    const all = Array.from({ length: totalQuestions }, (_, i) => i);
    if (reviewFilter === 'incomplete') return all.filter(i => !testAnswers[i] || testAnswers[i]!.selectedAnswers.length === 0);
    if (reviewFilter === 'flagged') return all.filter(i => flaggedQuestions.has(i));
    return all;
  };
  const filtered = getFiltered();

  return (
    <div className="pv-fullscreen">
      <div className="pv-exam">
        <div className="pv-topbar">
          <div className="pv-topbar-left"><span className="pv-exam-title">{testName}</span></div>
          <div className="pv-topbar-right">
            <div className={`pv-timer ${timeLeft < 300 ? 'pv-timer-warning' : ''}`}>
              <span className="pv-timer-icon"><Timer size={14} /></span> {formatTime(timeLeft)}
            </div>
          </div>
        </div>
        <div className="pv-review-screen">
          <h2 className="pv-review-title">Review Your Answers</h2>
          <div className="pv-review-summary">
            <div className="pv-review-stat"><span className="pv-review-stat-num">{answeredCount}</span><span className="pv-review-stat-label">Answered</span></div>
            <div className="pv-review-stat"><span className="pv-review-stat-num">{unansweredCount}</span><span className="pv-review-stat-label">Unanswered</span></div>
            <div className="pv-review-stat"><span className="pv-review-stat-num">{flaggedCount}</span><span className="pv-review-stat-label">Flagged</span></div>
          </div>
          <div className="pv-review-filters">
            <button className={`pv-filter-btn ${reviewFilter === 'all' ? 'active' : ''}`} onClick={() => onFilterChange('all')}>All ({totalQuestions})</button>
            <button className={`pv-filter-btn ${reviewFilter === 'incomplete' ? 'active' : ''}`} onClick={() => onFilterChange('incomplete')}>Unanswered ({unansweredCount})</button>
            <button className={`pv-filter-btn ${reviewFilter === 'flagged' ? 'active' : ''}`} onClick={() => onFilterChange('flagged')}>Flagged ({flaggedCount})</button>
          </div>
          <div className="pv-review-grid">
            {filtered.map(i => {
              const answered = testAnswers[i]?.selectedAnswers.length ? testAnswers[i]!.selectedAnswers.length > 0 : false;
              const flagged = flaggedQuestions.has(i);
              return (
                <button key={i} className={`pv-review-cell ${answered ? 'answered' : 'unanswered'} ${flagged ? 'flagged' : ''}`}
                  onClick={() => onGoToQuestion(i)} title={`Question ${i + 1}`}>
                  {i + 1}{flagged && <span className="pv-review-flag"><Flag size={10} /></span>}
                </button>
              );
            })}
          </div>
          <div className="pv-review-actions">
            <button className="pv-btn pv-btn-secondary" onClick={onReturnToExam}>Return to Exam</button>
            <button className="pv-btn pv-btn-end" onClick={onEndExam}>End Exam</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamReviewScreen;
