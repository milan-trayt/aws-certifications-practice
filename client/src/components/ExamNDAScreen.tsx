import React from 'react';
import './FullMockTest.css';

interface ExamNDAScreenProps {
  testName: string;
  questionCount: number;
  timeLimitSec: number;
  passingScore: number;
  onStart: () => void;
  onCancel: () => void;
  formatTimeLimit: (seconds: number) => string;
}

const ExamNDAScreen: React.FC<ExamNDAScreenProps> = ({
  testName,
  questionCount,
  timeLimitSec,
  passingScore,
  onStart,
  onCancel,
  formatTimeLimit,
}) => {
  return (
    <div className="pv-fullscreen">
      <div className="pv-exam">
        <div className="pv-nda">
          <div className="pv-nda-card">
            <div className="pv-nda-header">AWS Certification Practice Exam</div>
            <div className="pv-nda-body">
              <h3 className="pv-nda-test-name">{testName}</h3>
              <div className="pv-nda-info">
                <div className="pv-nda-info-row"><span>Questions</span><span>{questionCount}</span></div>
                <div className="pv-nda-info-row"><span>Time Limit</span><span>{formatTimeLimit(timeLimitSec)}</span></div>
                <div className="pv-nda-info-row"><span>Passing Score</span><span>{passingScore} / 1000</span></div>
              </div>
              <div className="pv-nda-text">
                <p>Non-Disclosure Agreement</p>
                <ul>
                  <li>This is a practice simulation of the AWS Certification exam.</li>
                  <li>No feedback will be provided during the exam.</li>
                  <li>You may flag questions and navigate freely between them.</li>
                  <li>The timer begins when you click "Start Exam".</li>
                  <li>Results will be saved upon completion.</li>
                </ul>
              </div>
            </div>
            <div className="pv-nda-actions">
              <button className="pv-btn pv-btn-secondary" onClick={onCancel}>Cancel</button>
              <button className="pv-btn pv-btn-primary" onClick={onStart}>Start Exam</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ExamNDAScreen;
