import React from 'react';
import { Question } from '../types';
import { Timer, Flag, ImageOff, ChevronLeft, ChevronRight } from 'lucide-react';
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
}

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
}) => {
  const correctAnswers = currentQuestion.correct_answer.split('');
  const isMultiple = correctAnswers.length > 1;

  return (
    <div className="pv-fullscreen">
      <div className="pv-exam">
        <div className="pv-topbar">
          <div className="pv-topbar-left">
            <span className="pv-exam-title">{testName}</span>
            <span className="pv-question-counter">Question {currentQuestionIndex + 1} of {totalQuestions}</span>
          </div>
          <div className="pv-topbar-right">
            <div className={`pv-timer ${timeLeft < 300 ? 'pv-timer-warning' : ''}`}
              role="timer" aria-label={`Time remaining: ${formatTime(timeLeft)}`}>
              <span className="pv-timer-icon" aria-hidden="true"><Timer size={14} /></span> {formatTime(timeLeft)}
            </div>
          </div>
        </div>

        <div className="pv-question-area">
          <div className="pv-question-content">
            <div className="pv-question-text">
              {renderTextWithImages(currentQuestion.question_text, currentQuestion.question_images || [])}
            </div>
            {choices.length > 0 ? (
              <div className="pv-choices">
                {choices.map(({ key, value }) => (
                  <div key={key} className={`pv-choice ${selectedAnswers.includes(key) ? 'pv-selected' : ''}`}
                    onClick={() => onChoiceClick(key)}>
                    <span className={`pv-choice-indicator ${isMultiple ? 'checkbox' : 'radio'} ${selectedAnswers.includes(key) ? 'checked' : ''}`} />
                    <span className="pv-choice-key">{key}.</span>
                    <span className="pv-choice-val">{renderTextWithImages(value, currentQuestion.answer_images || [])}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="pv-no-choices"><p><ImageOff size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> Image-based answer choices not available in the dataset.</p></div>
            )}
          </div>
        </div>

        <div className="pv-bottombar">
          <div className="pv-bottombar-left">
            <button className="pv-btn pv-btn-nav" onClick={onPrev} disabled={currentQuestionIndex === 0}><ChevronLeft size={14} /> Previous</button>
            <button className="pv-btn pv-btn-nav" onClick={onNext} disabled={currentQuestionIndex === totalQuestions - 1}>Next <ChevronRight size={14} /></button>
          </div>
          <div className="pv-bottombar-center">
            <button className={`pv-btn pv-btn-flag ${isFlagged ? 'flagged' : ''}`} onClick={onToggleFlag}
              aria-label={isFlagged ? 'Remove flag from question' : 'Flag question for review'}>
              {isFlagged ? <><Flag size={14} /> Flagged</> : <><Flag size={14} /> Flag</>}
            </button>
          </div>
          <div className="pv-bottombar-right">
            <button className="pv-btn pv-btn-review" onClick={onReview}>Review / End Exam</button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamActiveScreen;
