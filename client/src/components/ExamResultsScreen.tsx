import React from 'react';
import './FullMockTest.css';

interface ScoreData {
  correct: number;
  total: number;
  percentage: number;
  scaled: number;
  passed: boolean;
  passingScore: number;
}

interface ExamResultsScreenProps {
  score: ScoreData;
  unansweredCount: number;
  flaggedCount: number;
  isSavingResults: boolean;
  onReviewAnswers: () => void;
  onClose: () => void;
}

const ExamResultsScreen: React.FC<ExamResultsScreenProps> = ({
  score,
  unansweredCount,
  flaggedCount,
  isSavingResults,
  onReviewAnswers,
  onClose,
}) => {
  return (
    <div className="pv-fullscreen">
      <div className="pv-exam">
        <div className="pv-results">
          <div className="pv-results-card">
            <div className="pv-results-header">Exam Complete</div>
            <div className="pv-results-body">
              {isSavingResults && <div className="pv-saving">Saving results...</div>}
              <div className={`pv-results-badge ${score.passed ? 'passed' : 'failed'}`}>
                {score.passed ? 'PASS' : 'FAIL'}
              </div>
              <div className="pv-results-score">
                <div className="pv-results-scaled">
                  <span className="pv-results-scaled-num">{score.scaled}</span>
                  <span className="pv-results-scaled-label">/ 1000</span>
                </div>
                <div className="pv-results-passing">Passing score: {score.passingScore}</div>
              </div>
              <div className="pv-results-breakdown">
                <div className="pv-results-row"><span>Correct</span><span>{score.correct} / {score.total}</span></div>
                <div className="pv-results-row"><span>Percentage</span><span>{score.percentage}%</span></div>
                <div className="pv-results-row"><span>Unanswered</span><span>{unansweredCount}</span></div>
                <div className="pv-results-row"><span>Flagged</span><span>{flaggedCount}</span></div>
              </div>
            </div>
            <div className="pv-results-actions">
              <button className="pv-btn pv-btn-primary" onClick={onReviewAnswers}>Review Answers</button>
              <button className="pv-btn pv-btn-secondary" onClick={onClose}>Close</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamResultsScreen;
