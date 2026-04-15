import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Question } from '../types';
import Discussions from './Discussions';
import { progressService } from '../services/progressService';
import { PASSING_SCORE_DEFAULT, SCALED_SCORE_MIN, SCALED_SCORE_MAX, TIMER_WARNING_THRESHOLD } from '../constants';
import { ImageOff, Check, X, MinusCircle, MessageCircle, FileText, Save, ChevronLeft, ChevronRight, Flag, Timer, AlertTriangle } from 'lucide-react';
import './MockTest.css';
import './MockTestStart.css';

interface MockTestProps {
  questions: Question[];
  testName: string;
  testId: string;
}

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

// Fisher-Yates shuffle algorithm
const shuffleArray = <T,>(array: T[]): T[] => {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const MockTest: React.FC<MockTestProps> = ({ questions, testName, testId }) => {
  const [testQuestions, setTestQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [testAnswers, setTestAnswers] = useState<TestAnswer[]>([]);
  const [flaggedQuestions, setFlaggedQuestions] = useState<Set<number>>(new Set());
  const [skippedQuestions, setSkippedQuestions] = useState<Set<number>>(new Set());
  const [timeLeft, setTimeLeft] = useState(0); // Will be calculated based on question count
  const [isTestStarted, setIsTestStarted] = useState(false);
  const [isTestCompleted, setIsTestCompleted] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [questionCount, setQuestionCount] = useState(65);
  const [questionCountInput, setQuestionCountInput] = useState('65');
  const [shuffledChoicesMap, setShuffledChoicesMap] = useState<Record<number, ShuffledChoice[]>>({});
  const [showDiscussions, setShowDiscussions] = useState<number | null>(null);
  const [testStartTime, setTestStartTime] = useState<number>(0);
  const [isSavingResults, setIsSavingResults] = useState(false);
  const [maxQuestionReached, setMaxQuestionReached] = useState(0); // Track highest question index reached

  // Format time limit for display
  const formatTimeLimit = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (remainingSeconds === 0) {
      return `${minutes} minutes`;
    } else {
      return `${minutes} minutes ${remainingSeconds} seconds`;
    }
  };

  // Calculate time based on question count (130 min for 65 questions - real AWS associate exam)
  const calculateTimeLimit = (numQuestions: number) => {
    const baseTimeMinutes = 130; // 130 min for 65 questions (real AWS exam)
    const timePerQuestion = baseTimeMinutes / 65;
    const totalMinutes = timePerQuestion * numQuestions;
    
    // Convert to seconds and round up to nearest 15 seconds
    const totalSeconds = Math.ceil(totalMinutes * 60);
    const roundedSeconds = Math.ceil(totalSeconds / 15) * 15;
    
    return roundedSeconds;
  };

  // Handle page refresh warning during active test
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isTestStarted && !isTestCompleted) {
        e.preventDefault();
        e.returnValue = 'You are currently taking a mock test. Leaving this page will lose all your progress. Are you sure?';
        return e.returnValue;
      }
    };

    if (isTestStarted && !isTestCompleted) {
      window.addEventListener('beforeunload', handleBeforeUnload);
    }

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isTestStarted, isTestCompleted]);

  // Clear any mock test data from localStorage on component mount
  useEffect(() => {
    // Clean up any previous mock test data
    const keysToRemove = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('mockTest')) {
        keysToRemove.push(key);
      }
    }
    keysToRemove.forEach(key => localStorage.removeItem(key));
  }, []);

  // Function to render text with images or placeholders
  const renderTextWithImages = (text: string, images: string[] = []) => {
    const parts = text.split('//IMG//');
    const result: React.ReactNode[] = [];
    
    parts.forEach((part, index) => {
      if (part) {
        result.push(
          <span key={`text-${index}`}>
            {part.split('\n').map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {line}
                {lineIndex < part.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </span>
        );
      }
      
      // Add image or placeholder after each text part (except the last one)
      if (index < parts.length - 1) {
        if (images[index]) {
          result.push(
            <div key={`img-${index}`} className="question-image-container">
              <img 
                src={images[index]} 
                alt={`Image ${index + 1}`}
                className="question-image"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          );
        } else {
          result.push(
            <div key={`placeholder-${index}`} className="missing-image">
              <p>Image placeholder - Image not available in dataset</p>
            </div>
          );
        }
      }
    });
    
    return result;
  };

  const initializeTest = () => {
    // Select random questions based on questionCount
    const shuffled = shuffleArray(questions);
    const selectedQuestions = shuffled.slice(0, questionCount);
    setTestQuestions(selectedQuestions);
    
    // Initialize shuffled choices for all questions
    const choicesMap: Record<number, ShuffledChoice[]> = {};
    selectedQuestions.forEach((question, index) => {
      const hasValidChoices = Object.values(question.choices).some(choice => choice.trim().length > 0);
      
      if (hasValidChoices) {
        const choicesArray = Object.entries(question.choices)
          .filter(([key, value]) => value.trim().length > 0)
          .map(([key, value]) => ({
            key,
            value
          }));
        choicesMap[index] = shuffleArray(choicesArray);
      } else {
        // For questions without valid choices, create empty array
        choicesMap[index] = [];
      }
    });
    setShuffledChoicesMap(choicesMap);
    
    setCurrentQuestionIndex(0);
    setMaxQuestionReached(0); // Reset max question reached to first question
    setTestAnswers([]);
    const calculatedTime = calculateTimeLimit(questionCount);
    setTimeLeft(calculatedTime);
    setIsTestStarted(false);
    setIsTestCompleted(false);
    setShowResults(false);
    // Clear mock test active flag when initializing new test
    localStorage.removeItem('mockTestActive');
  };

  useEffect(() => {
    initializeTest();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions, questionCount]);

  useEffect(() => {
    let timer: NodeJS.Timeout;
    
    if (isTestStarted && timeLeft > 0 && !isTestCompleted) {
      timer = setTimeout(() => {
        setTimeLeft(prev => prev - 1);
      }, 1000);
    } else if (timeLeft === 0 && isTestStarted && !isTestCompleted) {
      completeTest();
    }

    return () => clearTimeout(timer);
  }, [isTestStarted, timeLeft, isTestCompleted]);

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const startTest = () => {
    setIsTestStarted(true);
    setTestStartTime(Date.now());
    // Save that mock test is active
    localStorage.setItem('mockTestActive', 'true');
  };

  // Calculate current progress for real-time display
  const currentProgress = useMemo(() => {
    const answeredCount = testAnswers.filter(answer => answer && answer.selectedAnswers.length > 0).length;
    const skippedCount = skippedQuestions.size;
    const flaggedCount = flaggedQuestions.size;
    const skippedQuestionNumbers = Array.from(skippedQuestions).map(index => index + 1).sort((a, b) => a - b);
    const flaggedQuestionNumbers = Array.from(flaggedQuestions).map(index => index + 1).sort((a, b) => a - b);
    
    return {
      answered: answeredCount,
      skipped: skippedCount,
      flagged: flaggedCount,
      skippedQuestions: skippedQuestionNumbers,
      flaggedQuestions: flaggedQuestionNumbers,
      total: testQuestions.length
    };
  }, [testAnswers, skippedQuestions, flaggedQuestions, testQuestions.length]); const handleAnswer = useCallback((selectedAnswers: string[]) => {
    const currentQuestion = testQuestions[currentQuestionIndex];
    const correctAnswers = currentQuestion.correct_answer.split('');
    
    const isCorrect = selectedAnswers.length === correctAnswers.length && 
                     selectedAnswers.every(answer => correctAnswers.includes(answer));

    const testAnswer: TestAnswer = {
      questionIndex: currentQuestionIndex,
      selectedAnswers,
      isCorrect,
      question: currentQuestion,
      shuffledChoices: shuffledChoicesMap[currentQuestionIndex]
    };

    setTestAnswers(prev => {
      const updated = [...prev];
      updated[currentQuestionIndex] = testAnswer;
      return updated;
    });
    
    // Remove from skipped questions when answered
    if (selectedAnswers.length > 0) {
      setSkippedQuestions(prev => {
        const updated = new Set(prev);
        updated.delete(currentQuestionIndex);
        return updated;
      });
    }
    
    // Immediately update progress calculation for real-time stats
    // This allows users to see their current score as they answer questions
  }, [testQuestions, currentQuestionIndex, shuffledChoicesMap]);

  const toggleFlag = useCallback(() => {
    setFlaggedQuestions(prev => {
      const updated = new Set(prev);
      if (updated.has(currentQuestionIndex)) {
        updated.delete(currentQuestionIndex);
      } else {
        updated.add(currentQuestionIndex);
      }
      return updated;
    });
  }, [currentQuestionIndex]);

  const skipQuestion = () => {
    // Remove the explicit skip function - questions are skipped by going to next without answering
    nextQuestion();
  };

  const nextQuestion = () => {
    // If current question has no answer, mark it as skipped
    if (!testAnswers[currentQuestionIndex] || testAnswers[currentQuestionIndex].selectedAnswers.length === 0) {
      setSkippedQuestions(prev => new Set(prev).add(currentQuestionIndex));
    }
    
    if (currentQuestionIndex < testQuestions.length - 1) {
      const nextIndex = currentQuestionIndex + 1;
      setCurrentQuestionIndex(nextIndex);
      // Update max question reached when moving forward
      setMaxQuestionReached(prev => Math.max(prev, nextIndex));
    }
    // Remove the else clause - no auto-complete on last question
  };

  const goToQuestion = (questionIndex: number) => {
    // Only allow navigation to questions that have been reached before
    if (questionIndex >= 0 && questionIndex <= maxQuestionReached && questionIndex < testQuestions.length) {
      setCurrentQuestionIndex(questionIndex);
    }
  };

  const previousQuestion = useCallback(() => {
    if (currentQuestionIndex > 0) {
      setCurrentQuestionIndex(prev => prev - 1);
    }
  }, [currentQuestionIndex]);

  const completeTest = async () => {
    setIsTestCompleted(true);
    setIsTestStarted(false);
    setIsSavingResults(true);
    
    // Clear mock test active flag
    localStorage.removeItem('mockTestActive');
    
    try {
      // Calculate test results
      const correctAnswers = testAnswers.filter(answer => answer && answer.isCorrect).length;
      const totalQuestions = testQuestions.length;
      const timeSpent = Math.floor((Date.now() - testStartTime) / 1000); // in seconds
      
      // Prepare answers data for saving
      const answersData = testQuestions.map((question, index) => {
        const answer = testAnswers[index];
        const questionTime = answer ? 
          Math.floor(timeSpent / totalQuestions) : // Estimate time per question
          0;
        
        return {
          questionId: question.question_id,
          userAnswer: answer && answer.selectedAnswers.length > 0 ? answer.selectedAnswers.join('') : 'SKIPPED',
          isCorrect: answer ? answer.isCorrect : false,
          timeTaken: questionTime
        };
      });
      
      // Save mock test results
      await progressService.saveMockTestResults({
        testId,
        score: correctAnswers,
        totalQuestions,
        timeSpent,
        answers: answersData
      });
      
      console.log('Mock test results saved successfully');
    } catch (error) {
      console.error('Error saving mock test results:', error);
      // Don't block the UI if saving fails - user can still see results
    } finally {
      setIsSavingResults(false);
    }
  };

  const score = useMemo(() => {
    const correctAnswers = testAnswers.filter(answer => answer && answer.isCorrect).length;
    const percentage = Math.round((correctAnswers / testQuestions.length) * 100);
    const scaled = Math.round(SCALED_SCORE_MIN + (percentage / 100) * (SCALED_SCORE_MAX - SCALED_SCORE_MIN));
    return {
      correct: correctAnswers,
      total: testQuestions.length,
      percentage,
      scaled,
      passed: scaled >= PASSING_SCORE_DEFAULT
    };
  }, [testAnswers, testQuestions.length]);

  const showDetailedResults = useCallback(() => {
    setShowResults(true);
  }, []);

  const backToSummary = useCallback(() => {
    setShowResults(false);
  }, []);

  if (!isTestStarted && !isTestCompleted) {
    return (
      <div className="mocktest-start-container">
        <div className="mocktest-start-card">
          <h2 className="mocktest-start-title">{testName} - Practice Mock</h2>
          <div className="mocktest-details-section">
            <div className="mocktest-detail-row">
              <span className="mocktest-detail-label">Questions:</span>
              <input
                type="number"
                min="1"
                max="65"
                value={questionCountInput}
                onChange={(e) => setQuestionCountInput(e.target.value)}
                onBlur={(e) => {
                  const value = e.target.value;
                  if (value === '' || isNaN(parseInt(value))) {
                    setQuestionCount(1);
                    setQuestionCountInput('1');
                  } else {
                    const num = Math.min(Math.max(1, parseInt(value)), 65);
                    setQuestionCount(num);
                    setQuestionCountInput(num.toString());
                  }
                }}
                className="mocktest-question-input"
              />
            </div>
            <div className="mocktest-detail-row">
              <span className="mocktest-detail-label">Time Limit:</span>
              <span className="mocktest-detail-value">{formatTimeLimit(calculateTimeLimit(questionCount))}</span>
            </div>
            <div className="mocktest-detail-row">
              <span className="mocktest-detail-label">Question Order:</span>
              <span className="mocktest-detail-value">Randomized</span>
            </div>
          </div>
          <div className="mocktest-instructions-section">
            <h3 className="mocktest-instructions-title">Instructions:</h3>
            <ul className="mocktest-instructions-list">
              <li className="mocktest-instructions-item">You have {formatTimeLimit(calculateTimeLimit(questionCount))} to complete {questionCount} questions</li>
              <li className="mocktest-instructions-item">Questions are presented in random order</li>
              <li className="mocktest-instructions-item">You can navigate between questions using Previous/Next buttons</li>
              <li className="mocktest-instructions-item">No feedback will be shown during the test</li>
              <li className="mocktest-instructions-item">Timer will start when you click "Start Test"</li>
              <li className="mocktest-instructions-item">Test will auto-submit when time expires</li>
              <li className="mocktest-instructions-item">You must reach the last question to submit the test</li>
              <li className="mocktest-instructions-item">Detailed results will be shown after completion</li>
            </ul>
          </div>
          <button className="mocktest-start-button" onClick={startTest}>
            Start Test
          </button>
        </div>
      </div>
    );
  }

  if (isTestCompleted && !showResults) {
    return (
      <div className="mock-test-results">
        <div className="results-card">
          <h2>{score.passed ? 'Test Passed!' : 'Test Completed'}</h2>
          {isSavingResults && (
            <div className="saving-indicator">
              <p><Save size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> Saving your results...</p>
            </div>
          )}
          <div className="score-display">
            <div className={`score-circle ${score.passed ? '' : 'failed'}`}>
              <span className="score-percentage">{score.scaled}</span>
              <span className="score-fraction">/ {SCALED_SCORE_MAX}</span>
            </div>
          </div>
          <div className="pass-fail-indicator">
            <span className={`pass-fail-badge ${score.passed ? 'passed' : 'failed'}`}>
              {score.passed ? 'PASS' : 'FAIL'}
            </span>
            <span className="passing-score-note">Passing score: {PASSING_SCORE_DEFAULT} / {SCALED_SCORE_MAX}</span>
          </div>
          <div className="score-details">
            <div className="score-item correct">
              <span className="score-label">Correct:</span>
              <span className="score-value">{score.correct}</span>
            </div>
            <div className="score-item incorrect">
              <span className="score-label">Incorrect:</span>
              <span className="score-value">{score.total - score.correct}</span>
            </div>
            <div className="score-item total">
              <span className="score-label">Percentage:</span>
              <span className="score-value">{score.percentage}%</span>
            </div>
          </div>
          <div className="results-actions">
            <button className="review-btn" onClick={showDetailedResults}>
              Review Answers
            </button>
            <button className="restart-test-btn" onClick={initializeTest}>
              Take Another Test
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showResults) {
    return (
      <div className="detailed-results">
        <div className="results-header">
          <h2><FileText size={20} style={{verticalAlign: 'middle', marginRight: 4}} /> Detailed Results</h2>
          <button className="back-btn" onClick={backToSummary}>
            <ChevronLeft size={14} style={{verticalAlign: 'middle'}} /> Back to Summary
          </button>
        </div>
        
        <div className="results-list">
          {testQuestions.map((question, index) => {
            const answer = testAnswers[index];
            const correctAnswers = question.correct_answer.split('');
            
            const getChoiceClass = (choice: string) => {
              if (!answer) {
                // For skipped questions, only highlight correct answers
                const isCorrectChoice = correctAnswers.includes(choice);
                return isCorrectChoice ? 'choice correct-highlight' : 'choice';
              }
              
              const isSelected = answer.selectedAnswers.includes(choice);
              const isCorrectChoice = correctAnswers.includes(choice);

              if (isSelected && isCorrectChoice) return 'choice correct';
              if (isSelected && !isCorrectChoice) return 'choice incorrect';
              if (!isSelected && isCorrectChoice) return 'choice correct-highlight';
              return 'choice';
            };

            return (
              <div key={index} className="result-question">
                <div className="result-header">
                  <h3>Question {index + 1}</h3>
                  <div className="result-actions">
                    <span className={`result-indicator ${answer ? (answer.isCorrect ? 'correct' : 'incorrect') : 'skipped'}`}>
                      {answer ? (answer.isCorrect ? <><Check size={12} /> Correct</> : <><X size={12} /> Incorrect</>) : <><MinusCircle size={12} /> Skipped</>}
                    </span>
                    {question.discussion && question.discussion.length > 0 && (
                      <button 
                        className="discussions-btn"
                        onClick={() => setShowDiscussions(index)}
                      >
                        <MessageCircle size={12} style={{verticalAlign: 'middle', marginRight: 4}} /> Discussions {question.discussion_count && `(${question.discussion_count})`}
                      </button>
                    )}
                  </div>
                </div>
                
                <div className="question-text">
                  {renderTextWithImages(question.question_text, question.question_images || [])}
                </div>

                <div className="choices">
                  {shuffledChoicesMap[index]?.map(({ key, value }) => (
                    <div key={key} className={getChoiceClass(key)}>
                      <span className="choice-label">{key}</span>
                      <span className="choice-text">
                        {renderTextWithImages(value, question.answer_images || [])}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
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
  }

  return (
    <div className="mock-test-active">
      <div className="test-header">
        <div className="test-info">
          <h2>{testName} - Practice Mock</h2>
          <div className="test-stats">
            {(() => {
              const progress = currentProgress;
              return (
                <>
                  <div className="stat-item">
                    <span className="stat-value">{progress.answered}</span>
                    <span className="stat-label">Answered</span>
                  </div>
                  <div 
                    className="stat-item" 
                    title={progress.skippedQuestions.length > 0 ? `Skipped Questions: ${progress.skippedQuestions.join(', ')}` : 'No skipped questions'}
                    data-mobile-info={progress.skippedQuestions.length > 0 ? `Q: ${progress.skippedQuestions.join(', ')}` : 'None'}
                    onClick={(e) => {
                      if (window.innerWidth <= 768 && e.currentTarget) {
                        const element = e.currentTarget;
                        element.classList.toggle('show-tooltip');
                        
                        // Hide on scroll
                        const hideTooltip = () => {
                          element.classList.remove('show-tooltip');
                          window.removeEventListener('scroll', hideTooltip);
                        };
                        
                        // Auto-hide after 2 seconds
                        const timeoutId = setTimeout(() => {
                          element.classList.remove('show-tooltip');
                          window.removeEventListener('scroll', hideTooltip);
                        }, 2000);
                        
                        // Hide immediately on scroll
                        window.addEventListener('scroll', hideTooltip, { once: true });
                      }
                    }}
                  >
                    <span className="stat-value">{progress.skipped}</span>
                    <span className="stat-label">Skipped</span>
                  </div>
                  <div 
                    className="stat-item flagged-stat" 
                    title={progress.flaggedQuestions.length > 0 ? `Flagged Questions: ${progress.flaggedQuestions.join(', ')}` : 'No flagged questions'}
                    data-mobile-info={progress.flaggedQuestions.length > 0 ? `Q: ${progress.flaggedQuestions.join(', ')}` : 'None'}
                    onClick={(e) => {
                      if (window.innerWidth <= 768 && e.currentTarget) {
                        const element = e.currentTarget;
                        element.classList.toggle('show-tooltip');
                        
                        // Hide on scroll
                        const hideTooltip = () => {
                          element.classList.remove('show-tooltip');
                          window.removeEventListener('scroll', hideTooltip);
                        };
                        
                        // Auto-hide after 2 seconds
                        const timeoutId = setTimeout(() => {
                          element.classList.remove('show-tooltip');
                          window.removeEventListener('scroll', hideTooltip);
                        }, 2000);
                        
                        // Hide immediately on scroll
                        window.addEventListener('scroll', hideTooltip, { once: true });
                      }
                    }}
                  >
                    <span className="stat-value">{progress.flagged}</span>
                    <span className="stat-label">Flagged</span>
                  </div>
                </>
              );
            })()}
          </div>
        </div>
        <div className="test-progress">
          <div className="progress-info">
            <span>Question {currentQuestionIndex + 1} of {testQuestions.length}</span>
            <select 
              className="question-dropdown"
              value={currentQuestionIndex}
              onChange={(e) => goToQuestion(parseInt(e.target.value))}
            >
              {testQuestions
                .slice(0, maxQuestionReached + 1) // Only show questions up to maxQuestionReached
                .map((_, index) => (
                <option key={index} value={index}>
                  Question {index + 1}
                  {testAnswers[index]?.selectedAnswers.length > 0 ? ' ✓' : ''}
                  {flaggedQuestions.has(index) ? ' ⚑' : ''}
                </option>
              ))}
            </select>
          </div>
          <div className="progress-bar">
            <div 
              className="progress-fill" 
              style={{ width: `${((currentQuestionIndex + 1) / testQuestions.length) * 100}%` }}
            />
          </div>
        </div>
        <div className={`timer ${timeLeft < TIMER_WARNING_THRESHOLD ? 'warning' : ''}`}>
          <Timer size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> {formatTime(timeLeft)}
        </div>
      </div>

      <MockQuestionCard
        key={`mock-${currentQuestionIndex}-${testQuestions[currentQuestionIndex]?.question_id}`}
        question={testQuestions[currentQuestionIndex]}
        questionIndex={currentQuestionIndex}
        shuffledChoices={shuffledChoicesMap[currentQuestionIndex] || []}
        selectedAnswers={testAnswers[currentQuestionIndex]?.selectedAnswers || []}
        onAnswerChange={handleAnswer}
        isFlagged={flaggedQuestions.has(currentQuestionIndex)}
        onToggleFlag={toggleFlag}
      />

      <div className="test-navigation">
        <button 
          className="nav-btn prev-btn" 
          onClick={previousQuestion}
          disabled={currentQuestionIndex === 0}
        >
          <ChevronLeft size={14} style={{verticalAlign: 'middle'}} /> Previous
        </button>
        
        {currentQuestionIndex === testQuestions.length - 1 ? (
          <button 
            className="complete-btn" 
            onClick={completeTest}
            disabled={isSavingResults}
          >
            {isSavingResults ? 'Submitting...' : 'Submit Test'}
          </button>
        ) : (
          <button 
            className="nav-btn next-btn" 
            onClick={nextQuestion}
          >
            Next <ChevronRight size={14} style={{verticalAlign: 'middle'}} />
          </button>
        )}
      </div>
    </div>
  );
};

// Separate component for mock test questions (no feedback during test)
interface MockQuestionCardProps {
  question: Question;
  questionIndex: number; // Add index for display numbering
  shuffledChoices: ShuffledChoice[];
  selectedAnswers: string[];
  onAnswerChange: (selectedAnswers: string[]) => void;
  isFlagged: boolean;
  onToggleFlag: () => void;
}

const MockQuestionCard: React.FC<MockQuestionCardProps> = ({ 
  question, 
  questionIndex,
  shuffledChoices, 
  selectedAnswers, 
  onAnswerChange,
  isFlagged,
  onToggleFlag
}) => {
  const correctAnswers = question.correct_answer.split('');
  const isMultipleAnswer = correctAnswers.length > 1;

  // Function to render text with images or placeholders
  const renderTextWithImages = (text: string, images: string[] = []) => {
    const parts = text.split('//IMG//');
    const result: React.ReactNode[] = [];
    
    parts.forEach((part, index) => {
      if (part) {
        result.push(
          <span key={`text-${index}`}>
            {part.split('\n').map((line, lineIndex) => (
              <React.Fragment key={lineIndex}>
                {line}
                {lineIndex < part.split('\n').length - 1 && <br />}
              </React.Fragment>
            ))}
          </span>
        );
      }
      
      // Add image or placeholder after each text part (except the last one)
      if (index < parts.length - 1) {
        if (images[index]) {
          result.push(
            <div key={`img-${index}`} className="question-image-container">
              <img 
                src={images[index]} 
                alt={`Image ${index + 1}`}
                className="question-image"
                onError={(e) => {
                  const target = e.target as HTMLImageElement;
                  target.style.display = 'none';
                }}
              />
            </div>
          );
        } else {
          result.push(
            <div key={`placeholder-${index}`} className="missing-image">
              <p>Image placeholder - Image not available in dataset</p>
            </div>
          );
        }
      }
    });
    
    return result;
  };

  const handleAnswerClick = (choice: string) => {
    if (isMultipleAnswer) {
      const updated = selectedAnswers.includes(choice)
        ? selectedAnswers.filter(a => a !== choice)
        : [...selectedAnswers, choice];
      onAnswerChange(updated);
    } else {
      onAnswerChange([choice]);
    }
  };

  // Check if question has valid choices
  const hasValidChoices = shuffledChoices.length > 0;
  const hasImagePlaceholder = question.question_text.includes('//IMG//');

  return (
    <div className="question-card">
      <div className="question-header">
        <h2>Question {questionIndex + 1}</h2>
        <div className="question-actions">
          {isMultipleAnswer && (
            <span className="multiple-indicator">Multiple Answers</span>
          )}
          {!hasValidChoices && hasImagePlaceholder && (
            <span className="multiple-indicator"><ImageOff size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> Image-Based</span>
          )}
          <button 
            className={`flag-btn ${isFlagged ? 'flagged' : ''}`}
            onClick={onToggleFlag}
            title={isFlagged ? 'Remove flag' : 'Flag question'}
          >
            <Flag size={14} />
          </button>
        </div>
      </div>
      
      <div className="question-text">
        {renderTextWithImages(question.question_text, question.question_images || [])}
      </div>

      {hasValidChoices ? (
        <div className="choices">
          {shuffledChoices.map(({ key, value }) => (
            <div
              key={key}
              className={`choice ${selectedAnswers.includes(key) ? 'selected' : ''}`}
              onClick={() => handleAnswerClick(key)}
              role="button"
              tabIndex={0}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleAnswerClick(key); } }}
            >
              <span className="choice-label">{key}</span>
              <span className="choice-text">
                {renderTextWithImages(value, question.answer_images || [])}
              </span>
            </div>
          ))}
        </div>
      ) : hasImagePlaceholder ? (
        <div className="question-error">
          <p><ImageOff size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> This question contains images with answer choices that are not available in the current dataset.</p>
          <p>The answer choices for this question are likely contained within the images above.</p>
          <p><em>Note: This question will be automatically marked as incorrect in the test results.</em></p>
        </div>
      ) : (
        <div className="question-error">
          <p><AlertTriangle size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> This question appears to be missing answer choices.</p>
        </div>
      )}

      {/* No submit button in mock test - users navigate with Previous/Next buttons */}
    </div>
  );
};

export default MockTest;

export {};