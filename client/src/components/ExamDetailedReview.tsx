import React, { useState } from 'react';
import { Question } from '../types';
import Discussions from './Discussions';
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

interface ExamDetailedReviewProps {
  testQuestions: Question[];
  testAnswers: (TestAnswer | undefined)[];
  shuffledChoicesMap: Record<number, ShuffledChoice[]>;
  renderTextWithImages: (text: string, images?: string[]) => React.ReactNode[];
  onBackToResults: () => void;
  colorScheme: string;
}

const ExamDetailedReview: React.FC<ExamDetailedReviewProps> = ({
  testQuestions,
  testAnswers,
  shuffledChoicesMap,
  renderTextWithImages,
  onBackToResults,
  colorScheme,
}) => {
  const [showDiscussions, setShowDiscussions] = useState<number | null>(null);

  return (
    <div className={`pv-fullscreen ${colorScheme}`}>
      <div className="pv-header">
        <div className="pv-header-left">Answer Review</div>
        <div className="pv-header-right" />
      </div>

      <div className="pv-content">
        <div className="pv-detailed-review-content">
          <div className="pv-detailed-header">
            <h2>Answer Review</h2>
            <button className="pv-btn pv-btn-secondary" onClick={onBackToResults}>◀ Back to Results</button>
          </div>
          <div className="pv-detailed-list">
            {testQuestions.map((q, i) => {
              const answer = testAnswers[i];
              const correctKeys = q.correct_answer.split('');
              const getClass = (key: string) => {
                if (!answer || answer.selectedAnswers.length === 0)
                  return correctKeys.includes(key) ? 'pv-review-choice pv-correct-highlight' : 'pv-review-choice';
                const sel = answer.selectedAnswers.includes(key);
                const cor = correctKeys.includes(key);
                if (sel && cor) return 'pv-review-choice pv-correct';
                if (sel && !cor) return 'pv-review-choice pv-incorrect';
                if (!sel && cor) return 'pv-review-choice pv-correct-highlight';
                return 'pv-review-choice';
              };
              const status = !answer || answer.selectedAnswers.length === 0
                ? 'skipped'
                : answer.isCorrect ? 'correct' : 'incorrect';
              return (
                <div key={i} className="pv-review-question">
                  <div className="pv-review-q-header">
                    <span className="pv-review-q-num">Question {i + 1}</span>
                    <div className="pv-review-q-actions">
                      <span className={`pv-review-q-status ${status}`}>
                        {status === 'correct' ? '✓ Correct' : status === 'incorrect' ? '✗ Incorrect' : '— Skipped'}
                      </span>
                      {q.discussion && q.discussion.length > 0 && (
                        <button className="pv-discussions-btn" onClick={() => setShowDiscussions(i)}>
                          💬 {q.discussion_count ? `(${q.discussion_count})` : ''}
                        </button>
                      )}
                    </div>
                  </div>
                  <div className="pv-review-q-text">{renderTextWithImages(q.question_text, q.question_images || [])}</div>
                  <div className="pv-review-choices">
                    {shuffledChoicesMap[i]?.map(({ key, value }) => (
                      <div key={key} className={getClass(key)}>
                        <span className="pv-review-choice-key">{key}.</span>
                        <span className="pv-review-choice-val">{renderTextWithImages(value, q.answer_images || [])}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <div className="pv-footer">
        <div className="pv-footer-left">
          <button className="pv-footer-btn" onClick={onBackToResults}>
            ◀ Back to Results
          </button>
        </div>
        <div className="pv-footer-right" />
      </div>

      {showDiscussions !== null && (
        <Discussions
          discussions={testQuestions[showDiscussions]?.discussion}
          discussionCount={testQuestions[showDiscussions]?.discussion_count}
          questionText={testQuestions[showDiscussions]?.question_text}
          questionNumber={showDiscussions + 1}
          onClose={() => setShowDiscussions(null)}
        />
      )}
    </div>
  );
};

export default ExamDetailedReview;
