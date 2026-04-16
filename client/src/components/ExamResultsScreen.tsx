import React from 'react';
import { LogOut } from 'lucide-react';
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
  colorScheme: string;
}

const ExamResultsScreen: React.FC<ExamResultsScreenProps> = ({
  score,
  unansweredCount,
  flaggedCount,
  isSavingResults,
  onReviewAnswers,
  onClose,
  colorScheme,
}) => {
  return (
    <div className={`pv-fullscreen ${colorScheme}`}>
      <div className="pv-header">
        <div className="pv-header-left">Exam Complete</div>
        <div className="pv-header-right" />
      </div>

      <div className="pv-content">
        <div className="pv-results-content">
          <div className="pv-aws-logo">
            <div className="pv-aws-logo-text"><strong>aws</strong></div>
            <div className="pv-aws-logo-sub">training and certification</div>
          </div>

          {isSavingResults && <div className="pv-saving">Saving results...</div>}

          <div className="pv-results-badge-area">
            <div className={`pv-results-badge ${score.passed ? 'passed' : 'failed'}`}>
              {score.passed ? 'PASS' : 'FAIL'}
            </div>
          </div>

          <div className="pv-results-score-area">
            <span className="pv-results-scaled-num">{score.scaled}</span>
            <span className="pv-results-scaled-label"> / 1000</span>
            <div className="pv-results-passing">Passing score: {score.passingScore}</div>
          </div>

          <table className="pv-results-table">
            <tbody>
              <tr><td>Correct</td><td>{score.correct} / {score.total}</td></tr>
              <tr><td>Percentage</td><td>{score.percentage}%</td></tr>
              <tr><td>Unanswered</td><td>{unansweredCount}</td></tr>
              <tr><td>Flagged</td><td>{flaggedCount}</td></tr>
            </tbody>
          </table>

          <div className="pv-results-actions">
            <button className="pv-btn pv-btn-primary" onClick={onReviewAnswers}>Review Answers</button>
            <button className="pv-btn pv-btn-secondary" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>

      <div className="pv-footer">
        <div className="pv-footer-left">
          <button className="pv-footer-btn" onClick={onClose}>
            <LogOut size={16} /> End Exam
          </button>
        </div>
        <div className="pv-footer-right" />
      </div>
    </div>
  );
};

export default ExamResultsScreen;
