import React, { useState } from 'react';
import { LogOut, ChevronRight } from 'lucide-react';
import './FullMockTest.css';

interface ExamNDAScreenProps {
  testName: string;
  questionCount: number;
  timeLimitSec: number;
  passingScore: number;
  onStart: () => void;
  onCancel: () => void;
  formatTimeLimit: (seconds: number) => string;
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

type NDAPage = 'welcome' | 'instructions' | 'ready';

const ExamNDAScreen: React.FC<ExamNDAScreenProps> = ({
  testName,
  questionCount,
  timeLimitSec,
  passingScore,
  onStart,
  onCancel,
  formatTimeLimit,
  colorScheme,
  onColorSchemeChange,
}) => {
  const [page, setPage] = useState<NDAPage>('welcome');

  const renderWelcome = () => (
    <div className="pv-welcome-content">
      <p className="pv-welcome-title">{testName}</p>
      <p className="pv-welcome-text">
        Use this tool to become familiar with the user interface and features of an AWS Certification exam,
        including color contrast options, identifying questions to review again later in the exam.
        You can practice using the following keyboard shortcuts to zoom in and out of the screen:
        Ctrl+ to zoom in, Ctrl- to zoom out, and Ctrl 0 to restore to default zoom features.
      </p>
      <p className="pv-welcome-text">
        Please select the Next button to start your exam.
      </p>
    </div>
  );

  const renderInstructions = () => (
    <div className="pv-welcome-content">
      <p className="pv-welcome-title">Exam Information</p>
      <p className="pv-welcome-text">
        This is a collection of previous exam questions. The real exam may vary in content, format, and difficulty.
      </p>
      <p className="pv-welcome-text">
        Time limit: {formatTimeLimit(timeLimitSec)} &bull; Questions: {questionCount} &bull; Passing score: {passingScore}/1000
      </p>
      <p className="pv-welcome-text">
        Please select the Next button to start your exam.
      </p>
    </div>
  );

  const renderReady = () => (
    <div className="pv-welcome-content">
      <p className="pv-welcome-text" style={{ fontWeight: 700 }}>
        You are about to begin the exam.
      </p>
      <p className="pv-welcome-text">
        The first question will appear when you select the Next button.
      </p>
      <p className="pv-welcome-text">
        Please select the Next button to start your exam.
      </p>
    </div>
  );

  const handleNext = () => {
    if (page === 'welcome') setPage('instructions');
    else if (page === 'instructions') setPage('ready');
    else onStart();
  };

  return (
    <div className={`pv-fullscreen ${colorScheme}`}>
      <div className="pv-header">
        <div className="pv-header-left">{testName}</div>
        <div className="pv-header-right">
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

      <div className="pv-content">
        {page === 'welcome' && renderWelcome()}
        {page === 'instructions' && renderInstructions()}
        {page === 'ready' && renderReady()}
      </div>

      <div className="pv-footer">
        <div className="pv-footer-left">
          <button className="pv-footer-btn" onClick={onCancel}>
            <LogOut size={16} /> End Exam
          </button>
        </div>
        <div className="pv-footer-right">
          <button className="pv-footer-btn" onClick={handleNext}>
            Next <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ExamNDAScreen;
