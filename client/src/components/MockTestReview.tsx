import React, { useState, useEffect } from 'react';
import { progressService } from '../services/progressService';
import Discussions from './Discussions';
import { CheckCircle, XCircle, Timer, MessageCircle, ImageOff, MinusCircle } from 'lucide-react';
import './MockTestReview.css';

interface MockTestReviewProps {
  mockTestId: number;
  onClose: () => void;
}

interface MockTestDetails {
  mockTest: {
    id: number;
    testId: string;
    testName: string;
    score: number;
    totalQuestions: number;
    timeSpent: number;
    completedAt: string;
    passingScore: number;
    passed: boolean;
    percentage: number;
    scaledScore: number;
  };
  answers: Array<{
    questionId: string;
    userAnswer: string;
    isCorrect: boolean;
    timeTaken: number;
    correctAnswer: string;
    questionText: string;
    choices: Record<string, string>;
    discussion?: any[];
    discussionCount?: number;
    questionImages?: string[];
    answerImages?: string[];
  }>;
}

const MockTestReview: React.FC<MockTestReviewProps> = ({ mockTestId, onClose }) => {
  const [mockTestDetails, setMockTestDetails] = useState<MockTestDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [showDiscussions, setShowDiscussions] = useState<number | null>(null);

  useEffect(() => {
    const loadMockTestDetails = async () => {
      try {
        setIsLoading(true);
        setError('');
        const details = await progressService.getMockTestDetails(mockTestId);
        setMockTestDetails(details);
      } catch (error: any) {
        console.error('Error loading mock test details:', error);
        setError('Failed to load test details.');
      } finally {
        setIsLoading(false);
      }
    };

    loadMockTestDetails();
  }, [mockTestId]);

  const formatTime = (seconds: number): string => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    if (hours > 0) {
      return `${hours}h ${minutes}m ${remainingSeconds}s`;
    } else if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    } else {
      return `${remainingSeconds}s`;
    }
  };

  const formatDate = (dateString: string): string => {
    return new Date(dateString).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

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
                onError={(e: React.SyntheticEvent<HTMLImageElement, Event>) => {
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

  const getChoiceClass = (choiceKey: string, answer: any) => {
    // Handle skipped questions
    if (answer.userAnswer === 'SKIPPED' || !answer.userAnswer) {
      const correctAnswers = answer.correctAnswer.split('');
      const isCorrect = correctAnswers.includes(choiceKey);
      return isCorrect ? 'choice correct-highlight' : 'choice';
    }
    
    const userAnswers = answer.userAnswer.split('');
    const correctAnswers = answer.correctAnswer.split('');
    
    const isSelected = userAnswers.includes(choiceKey);
    const isCorrect = correctAnswers.includes(choiceKey);
    
    if (isSelected && isCorrect) return 'choice selected correct';
    if (isSelected && !isCorrect) return 'choice selected incorrect';
    if (!isSelected && isCorrect) return 'choice correct-highlight';
    return 'choice';
  };

  if (isLoading) {
    return (
      <div className="mock-test-review">
        <div className="review-header">
          <button className="close-btn" onClick={onClose}>← Back to History</button>
        </div>
        <div className="loading">Loading test review...</div>
      </div>
    );
  }

  if (error || !mockTestDetails) {
    return (
      <div className="mock-test-review">
        <div className="review-header">
          <button className="close-btn" onClick={onClose}>← Back to History</button>
        </div>
        <div className="error-message">
          <p>{error || 'Failed to load test details'}</p>
          <button onClick={() => window.location.reload()}>Retry</button>
        </div>
      </div>
    );
  }

  const { mockTest, answers } = mockTestDetails;

  return (
    <div className="mock-test-review">
      <div className="review-header">
        <button className="close-btn" onClick={onClose}>‹</button>
        <div className="review-test-details">
          <span>{mockTest.testName}</span>
          <span>•</span>
          <span>{formatDate(mockTest.completedAt)}</span>
        </div>
      </div>

      <div className="review-summary">
        <div className="summary-stats">
          <div className={`score-card ${mockTest.passed ? 'passed' : 'failed'}`}>
            <div className="score-main">
              <span className="score-value">{mockTest.scaledScore}/1000</span>
              <span className="score-percentage">{mockTest.score}/{mockTest.totalQuestions} ({mockTest.percentage}%)</span>
            </div>
            <div className={`score-status ${mockTest.passed ? 'passed' : 'failed'}`}>
              {mockTest.passed ? <><CheckCircle size={14} style={{verticalAlign: 'middle', marginRight: 2}} /> PASSED</> : <><XCircle size={14} style={{verticalAlign: 'middle', marginRight: 2}} /> FAILED</>}
            </div>
          </div>
          
          <div className="summary-details">
            <div className="detail-item">
              <span className="detail-label">Time Spent:</span>
              <span className="detail-value">{formatTime(mockTest.timeSpent)}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Passing Score:</span>
              <span className="detail-value">{mockTest.passingScore}/1000</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Correct Answers:</span>
              <span className="detail-value">{answers.filter(a => a.isCorrect).length}</span>
            </div>
            <div className="detail-item">
              <span className="detail-label">Incorrect Answers:</span>
              <span className="detail-value">{answers.filter(a => !a.isCorrect).length}</span>
            </div>
          </div>
        </div>
      </div>

      <div className="questions-review">
        <h2>Question-by-Question Review</h2>
        
        {answers.map((answer: any, index: number) => {
          const isSkipped = answer.userAnswer === 'SKIPPED';
          return (
          <div key={answer.questionId} className={`question-review ${isSkipped ? 'skipped' : (answer.isCorrect ? 'correct' : 'incorrect')}`}>
            <div className="question-header">
              <div className="question-info">
                <h3>Question {index + 1}</h3>
                <div className="question-meta">
                  <span className={`result-indicator ${isSkipped ? 'skipped' : (answer.isCorrect ? 'correct' : 'incorrect')}`}>
                    {isSkipped ? <><MinusCircle size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> Skipped</> : (answer.isCorrect ? <><CheckCircle size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> Correct</> : <><XCircle size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> Incorrect</>)}
                  </span>
                  <span className="time-taken"><Timer size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> {formatTime(answer.timeTaken)}</span>
                </div>
              </div>
              {answer.discussion && answer.discussion.length > 0 && (
                <button 
                  className="discussions-btn"
                  onClick={() => setShowDiscussions(index)}
                >
                  <MessageCircle size={12} style={{verticalAlign: 'middle', marginRight: 4}} /> Discussions {answer.discussionCount && `(${answer.discussionCount})`}
                </button>
              )}
            </div>

            <div className="question-content">
              <div className="question-text">
                {renderTextWithImages(answer.questionText, answer.questionImages || [])}
              </div>

              <div className="choices">
                {Object.entries(answer.choices as Record<string, string>).map(([key, value]: [string, string]) => (
                  <div key={key} className={getChoiceClass(key, answer)}>
                    <span className="choice-label">{key}</span>
                    <span className="choice-text">
                      {renderTextWithImages(value, answer.answerImages || [])}
                    </span>
                  </div>
                ))}
              </div>

              <div className="answer-summary">
                <div className="answer-row">
                  <span className="answer-label">Your Answer:</span>
                  <span className={`answer-value ${answer.userAnswer === 'SKIPPED' ? 'skipped' : (answer.isCorrect ? 'correct' : 'incorrect')}`}>
                    {answer.userAnswer === 'SKIPPED' ? 'Skipped' : (answer.userAnswer || 'No answer')}
                  </span>
                </div>
                <div className="answer-row">
                  <span className="answer-label">Correct Answer:</span>
                  <span className="answer-value correct">{answer.correctAnswer}</span>
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {showDiscussions !== null && answers[showDiscussions] && (
        <Discussions
          discussions={answers[showDiscussions].discussion}
          discussionCount={answers[showDiscussions].discussionCount}
          questionText={answers[showDiscussions].questionText}
          questionNumber={showDiscussions + 1}
          onClose={() => setShowDiscussions(null)}
        />
      )}
    </div>
  );
};

export default MockTestReview;