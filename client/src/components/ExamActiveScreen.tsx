import React, { useState } from 'react';
import { Question } from '../types';
import { Clock, ListOrdered, FileEdit, Flag, ChevronLeft, ChevronRight } from 'lucide-react';
import './FullMockTest.css';

interface ShuffledChoice {
  key: string;
  value: string;
}

interface ExamActiveScreenProps {
  testName: string;
  currentQuestionIndex: number;
  totalQuestions: number;
  currentQuestion: Question;
  choices: ShuffledChoice[];
  selectedAnswers: string[];
  isFlagged: boolean;
  timeLeft: number;
  formatTime: (seconds: number) => string;
  renderTextWithImages: (text: string, images?: string[]) => React.ReactNode[];
  onChoiceClick: (key: string) => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleFlag: () => void;
  onReview: () => void;
  colorScheme: string;
  onColorSchemeChange: (scheme: string) => void;
  cameFromReview?: boolean;
  onReturnToReview?: () => void;
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

const ExamActiveScreen: React.FC<ExamActiveScreenProps> = ({
  testName,
  currentQuestionIndex,
  totalQuestions,
  currentQuestion,
  choices,
  selectedAnswers,
  isFlagged,
  timeLeft,
  formatTime,
  renderTextWithImages,
  onChoiceClick,
  onNext,
  onPrev,
  onToggleFlag,
  onReview,
  colorScheme,
  onColorSchemeChange,
  cameFromReview,
  onReturnToReview,
}) => {
  const [showComment, setShowComment] = useState(false);
  const [comment, setComment] = useState('');
  const correctAnswers = currentQuestion.correct_answer.split('');
  const isMultiple = correctAnswers.length > 1;

  return (
    <div className={`pv-fullscreen ${colorScheme}`}>
      {/* Header */}
      <div className="pv-header">
        <div className="pv-header-left">{testName}</div>
        <div className="pv-header-right-stacked">
          <span className="pv-header-info-line">
            <Clock size={14} style={{ verticalAlign: 'middle', marginRight: 2 }} />
            Time Remaining {formatTime(timeLeft)}
          </span>
          <span className="pv-header-info-line">
            <ListOrdered size={14} style={{ verticalAlign: 'middle', marginRight: 2 }} />
            Question {currentQuestionIndex + 1} of {totalQuestions}
          </span>
        </div>
      </div>

      {/* Sub-header */}
      <div className="pv-subheader">
        <div className="pv-subheader-left">
          <button
            className="pv-subheader-btn"
            onClick={() => setShowComment(!showComment)}
          >
            <FileEdit size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            Comment
          </button>
        </div>
        <div className="pv-subheader-right">
          <button
            className={`pv-tag-for-review ${isFlagged ? 'tagged' : ''}`}
            onClick={onToggleFlag}
          >
            <Flag size={15} fill={isFlagged ? 'currentColor' : 'none'} style={{ verticalAlign: 'middle', marginRight: 4 }} />
            {isFlagged ? 'Flagged for Review' : 'Flag for Review'}
          </button>
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
        <div className="pv-question-text">
          {renderTextWithImages(currentQuestion.question_text, currentQuestion.question_images || [])}
          {isMultiple && (
            <span> (Select {correctAnswers.length === 2 ? 'TWO' : correctAnswers.length === 3 ? 'THREE' : correctAnswers.length}.)</span>
          )}
        </div>

        {choices.length > 0 ? (
          <div className="pv-choices-list">
            {choices.map(({ key, value }) => (
              <div
                key={key}
                className="pv-choice-item"
                onClick={() => onChoiceClick(key)}
              >
                <input
                  type={isMultiple ? 'checkbox' : 'radio'}
                  className="pv-choice-input"
                  checked={selectedAnswers.includes(key)}
                  onChange={() => onChoiceClick(key)}
                  name={`question-${currentQuestionIndex}`}
                />
                <span className="pv-choice-label">
                  <span className="pv-choice-letter">{key}.</span>
                  <span className="pv-choice-text">
                    {renderTextWithImages(value, currentQuestion.answer_images || [])}
                  </span>
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="pv-no-choices">
            Image-based answer choices not available in the dataset.
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="pv-footer">
        <div className="pv-footer-left">
          {cameFromReview && onReturnToReview && (
            <button className="pv-footer-btn" onClick={onReturnToReview}>
              <ChevronLeft size={16} /> Return to Review
            </button>
          )}
        </div>
        <div className="pv-footer-right">
          {currentQuestionIndex > 0 && (
            <button className="pv-footer-btn" onClick={onPrev}>
              <ChevronLeft size={16} /> Previous
            </button>
          )}
          {currentQuestionIndex < totalQuestions - 1 ? (
            <button className="pv-footer-btn" onClick={onNext}>
              Next <ChevronRight size={16} />
            </button>
          ) : (
            <button className="pv-footer-btn" onClick={onReview}>
              Next <ChevronRight size={16} />
            </button>
          )}
        </div>
      </div>

      {/* Comment Dialog */}
      {showComment && (
        <>
          <div className="pv-modal-overlay" onClick={() => setShowComment(false)} />
          <div className="pv-comment-dialog">
            <div className="pv-comment-header">
              <FileEdit size={15} style={{ verticalAlign: 'middle', marginRight: 4 }} />
              Comment
            </div>
            <div className="pv-comment-body">
              <textarea
                className="pv-comment-textarea"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <div className="pv-comment-actions">
              <button className="pv-modal-btn" onClick={() => setShowComment(false)}>Save</button>
              <button className="pv-modal-btn" onClick={() => setShowComment(false)}>Cancel</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default ExamActiveScreen;
