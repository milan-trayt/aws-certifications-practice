import React, { useState } from 'react';
import { Clock, LogOut, Flag } from 'lucide-react';
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
  colorScheme: string;
  onColorSchemeChange: (scheme: string) => void;
}

const COLOR_SCHEMES = [
  { value: 'pv-scheme-black-on-white', label: 'Black on White' },
  { value: 'pv-scheme-black-on-light-yellow', label: 'Black on Light Yellow' },
  { value: 'pv-scheme-black-on-salmon', label: 'Black on Salmon' },
  { value: 'pv-scheme-black-on-yellow', label: 'Black on Yellow' },
  { value: 'pv-scheme-blue-on-white', label: 'Blue on White' },
  { value: 'pv-scheme-blue-on-yellow', label: 'Blue on Yellow' },
  { value: 'pv-scheme-light-yellow-on-black', label: 'Light Yellow on Black' },
  { value: 'pv-scheme-white-on-black', label: 'White on Black' },
  { value: 'pv-scheme-white-on-blue', label: 'White on Blue' },
  { value: 'pv-scheme-yellow-on-black', label: 'Yellow on Black' },
  { value: 'pv-scheme-yellow-on-blue', label: 'Yellow on Blue' },
];

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
  colorScheme,
  onColorSchemeChange,
}) => {
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showEndConfirm2, setShowEndConfirm2] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);

  const getFiltered = () => {
    const all = Array.from({ length: totalQuestions }, (_, i) => i);
    if (reviewFilter === 'incomplete')
      return all.filter(i => !testAnswers[i] || testAnswers[i]!.selectedAnswers.length === 0);
    if (reviewFilter === 'flagged')
      return all.filter(i => flaggedQuestions.has(i));
    return all;
  };
  const filtered = getFiltered();

  const getReviewButtonLabel = () => {
    if (reviewFilter === 'all') return 'Review All';
    if (reviewFilter === 'incomplete') return 'Review Incomplete';
    return 'Review Flagged';
  };

  const handleEndReview = () => {
    setShowEndConfirm(true);
  };

  const handleFirstConfirmYes = () => {
    setShowEndConfirm(false);
    setShowEndConfirm2(true);
  };

  const handleSecondConfirmYes = () => {
    setShowEndConfirm2(false);
    onEndExam();
  };

  const handleReviewAll = () => {
    if (filtered.length > 0) {
      onGoToQuestion(filtered[0]);
    }
  };

  return (
    <div className={`pv-fullscreen ${colorScheme}`}>
      {/* Header */}
      <div className="pv-header">
        <div className="pv-header-left">{testName}</div>
        <div className="pv-header-right">
          <span className="pv-timer-display">
            <Clock size={14} style={{ verticalAlign: 'middle', marginRight: 2 }} />
            Time Remaining {formatTime(timeLeft)}
          </span>
        </div>
      </div>

      {/* Sub-header */}
      <div className="pv-subheader">
        <div className="pv-subheader-left">
          <button className="pv-subheader-btn" onClick={() => setShowInstructions(true)}>
            Instructions
          </button>
        </div>
        <div className="pv-subheader-right">
          <select
            className="pv-color-scheme-select"
            value={colorScheme}
            onChange={(e) => onColorSchemeChange(e.target.value)}
            aria-label="Color Scheme"
          >
            <option value="" disabled>Color Scheme</option>
            {COLOR_SCHEMES.map(s => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Content */}
      <div className="pv-content">
        <div className="pv-review-content">
          <h2 className="pv-review-heading">Review</h2>

          <button className="pv-review-action-btn" onClick={handleReviewAll}>
            {getReviewButtonLabel()}
          </button>

          <div style={{ clear: 'both' }} />

          {/* Tabs */}
          <div className="pv-review-tabs">
            <button
              className={`pv-review-tab ${reviewFilter === 'all' ? 'active' : ''}`}
              onClick={() => onFilterChange('all')}
            >
              All ({totalQuestions})
            </button>
            <button
              className={`pv-review-tab ${reviewFilter === 'incomplete' ? 'active' : ''}`}
              onClick={() => onFilterChange('incomplete')}
            >
              Incomplete ({unansweredCount}) <span className="pv-tab-info-icon" title="Questions that have not been answered">ⓘ</span>
            </button>
            <button
              className={`pv-review-tab ${reviewFilter === 'flagged' ? 'active' : ''}`}
              onClick={() => onFilterChange('flagged')}
            >
              Flagged ({flaggedCount}) <span className="pv-tab-info-icon" title="Questions that have been flagged for review">ⓘ</span>
            </button>
          </div>

          {/* Table */}
          <table className="pv-review-table">
            <thead>
              <tr>
                <th style={{ width: '80px' }}>QUESTION</th>
                <th>TITLE</th>
                <th style={{ width: '120px' }}>STATUS</th>
                <th style={{ width: '100px' }}>TAGGED</th>
                <th style={{ width: '80px' }}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(i => {
                const answered = testAnswers[i]?.selectedAnswers?.length
                  ? testAnswers[i]!.selectedAnswers.length > 0
                  : false;
                const flagged = flaggedQuestions.has(i);
                return (
                  <tr key={i}>
                    <td>{i + 1}</td>
                    <td>Question</td>
                    <td>
                      {answered ? (
                        <span className="pv-status-complete">Complete</span>
                      ) : (
                        <span className="pv-status-incomplete">Incomplete</span>
                      )}
                    </td>
                    <td>
                      <span className="pv-flag-cell">
                        {flagged ? 'Yes' : 'No'}
                        {flagged && <Flag size={12} className="pv-flag-cell-icon" />}
                      </span>
                    </td>
                    <td>
                      <span
                        className="pv-review-link"
                        onClick={() => onGoToQuestion(i)}
                      >
                        Review
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="pv-footer">
        <div className="pv-footer-left">
          <button className="pv-footer-btn" onClick={handleEndReview}>
            <LogOut size={16} /> End Review
          </button>
        </div>
        <div className="pv-footer-right" />
      </div>

      {/* First confirmation modal */}
      {showEndConfirm && (
        <div className="pv-modal-overlay">
          <div className="pv-modal">
            <div className="pv-modal-header">End Review Confirmation</div>
            <div className="pv-modal-body">
              <span className="pv-modal-icon">⚠️</span>
              <div className="pv-modal-text">
                <p>
                  Please confirm that you want to end this review. If you click
                  Yes, you will NOT be able to return to this review and answer
                  the {unansweredCount} questions you have not completed.
                </p>
                <p>Are you sure you want to end this review?</p>
              </div>
            </div>
            <div className="pv-modal-actions">
              <button className="pv-modal-btn" onClick={handleFirstConfirmYes}>Yes</button>
              <button className="pv-modal-btn" onClick={() => setShowEndConfirm(false)}>No</button>
            </div>
          </div>
        </div>
      )}

      {/* Second confirmation modal */}
      {showEndConfirm2 && (
        <div className="pv-modal-overlay">
          <div className="pv-modal">
            <div className="pv-modal-header">End Review</div>
            <div className="pv-modal-body">
              <span className="pv-modal-icon">⚠️</span>
              <div className="pv-modal-text">
                <p>
                  You have chosen to end the current review, but have {unansweredCount} incomplete
                  questions. If you click Yes, you will NOT be able to return to this review.
                </p>
                <p>Are you sure you want to end this review?</p>
              </div>
            </div>
            <div className="pv-modal-actions">
              <button className="pv-modal-btn" onClick={handleSecondConfirmYes}>Yes</button>
              <button className="pv-modal-btn" onClick={() => setShowEndConfirm2(false)}>No</button>
            </div>
          </div>
        </div>
      )}
      {/* Instructions modal */}
      {showInstructions && (
        <div className="pv-modal-overlay" onClick={() => setShowInstructions(false)}>
          <div className="pv-modal" onClick={(e) => e.stopPropagation()}>
            <div className="pv-modal-header">Exam Instructions</div>
            <div className="pv-modal-body">
              <div className="pv-modal-text">
                <p>Use the <strong>Review</strong> link to navigate to a specific question.</p>
                <p>Use the tabs to filter by <strong>All</strong>, <strong>Incomplete</strong>, or <strong>Flagged</strong> questions.</p>
                <p>Click <strong>End Review</strong> to submit your exam.</p>
                <p>You may flag questions for review using the <strong>Flag for Review</strong> button on each question.</p>
              </div>
            </div>
            <div className="pv-modal-actions">
              <button className="pv-modal-btn" onClick={() => setShowInstructions(false)}>OK</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExamReviewScreen;
