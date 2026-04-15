import React, { useState, useEffect, useCallback } from 'react';
import { Question } from '../types';
import { Bookmark, BookmarkPlus, ImageOff, Check, X, MessageCircle, AlertTriangle } from 'lucide-react';
import Discussions from './Discussions';
import './QuestionCard.css';

interface QuestionCardProps {
  question: Question;
  onNext: (isCorrect: boolean, userAnswer?: string, timeTaken?: number) => void;
  onAnswerSubmitted?: (isCorrect: boolean, userAnswer?: string, timeTaken?: number) => void;
  showNextButton?: boolean;
  showExplanation?: boolean;
  previousAnswer?: {
    userAnswer: string;
    isCorrect: boolean;
    timeTaken: number;
  };
  isBookmarked?: boolean;
  onToggleBookmark?: (questionId: string) => void;
}

interface ShuffledChoice {
  key: string;
  value: string;
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

const QuestionCard: React.FC<QuestionCardProps> = React.memo(({ 
  question, 
  onNext, 
  onAnswerSubmitted,
  showNextButton = true,
  showExplanation = false,
  previousAnswer,
  isBookmarked = false,
  onToggleBookmark
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<string[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [shuffledChoices, setShuffledChoices] = useState<ShuffledChoice[]>([]);
  const [showDiscussions, setShowDiscussions] = useState(false);
  const [startTime, setStartTime] = useState<number>(Date.now());

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
                alt={`Question ${question.question_number} - Image ${index + 1}`}
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
              <p><ImageOff size={16} style={{verticalAlign: 'middle', marginRight: 4}} /> Image placeholder - Image not available in dataset</p>
            </div>
          );
        }
      }
    });
    
    return result;
  };

  // Check if question has valid choices or image placeholders
  const hasValidChoices = Object.values(question.choices).some(choice => choice.trim().length > 0);
  const hasImagePlaceholder = question.question_text.includes('//IMG//');

  // Reset state and shuffle choices when question changes
  useEffect(() => {
    setSelectedAnswers([]);
    setShowResult(false);
    setIsSubmitted(false);
    setShowDiscussions(false);
    setStartTime(Date.now());
    
    // If there's a previous answer, show it
    if (previousAnswer) {
      setSelectedAnswers([previousAnswer.userAnswer]);
      setShowResult(showExplanation);
      setIsSubmitted(true);
    }
    
    if (hasValidChoices) {
      // Convert choices object to array and shuffle
      const choicesArray = Object.entries(question.choices)
        .filter(([key, value]) => value.trim().length > 0) // Filter out empty choices
        .map(([key, value]) => ({
          key,
          value
        }));
      
      setShuffledChoices(shuffleArray(choicesArray));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [question.question_id, previousAnswer, showExplanation]); // Reset when question changes

  const handleAnswerClick = (choice: string) => {
    if (isSubmitted) return;

    if (isMultipleAnswer) {
      setSelectedAnswers(prev => 
        prev.includes(choice) 
          ? prev.filter(a => a !== choice)
          : [...prev, choice]
      );
    } else {
      setSelectedAnswers([choice]);
      setIsSubmitted(true);
      setShowResult(true);
      
      // Immediately call onAnswerSubmitted for single-answer questions
      if (onAnswerSubmitted) {
        const timeTaken = Math.floor((Date.now() - startTime) / 1000);
        const isAnswerCorrect = choice === question.correct_answer;
        onAnswerSubmitted(isAnswerCorrect, choice, timeTaken);
      }
    }
  };

  const handleSubmit = () => {
    if (selectedAnswers.length === 0) return; // Prevent submitting without selection
    setIsSubmitted(true);
    setShowResult(true);
    
    // Call onAnswerSubmitted for multiple-answer questions
    if (onAnswerSubmitted) {
      const timeTaken = Math.floor((Date.now() - startTime) / 1000);
      const userAnswer = selectedAnswers.join('');
      const isAnswerCorrect = selectedAnswers.length === correctAnswers.length && 
                             selectedAnswers.every(answer => correctAnswers.includes(answer));
      onAnswerSubmitted(isAnswerCorrect, userAnswer, timeTaken);
    }
  };

  const isCorrect = () => {
    if (selectedAnswers.length === 0) return false; // No answer selected
    
    if (isMultipleAnswer) {
      return selectedAnswers.length === correctAnswers.length && 
             selectedAnswers.every(answer => correctAnswers.includes(answer));
    } else {
      return selectedAnswers[0] === question.correct_answer;
    }
  };

  const handleNext = useCallback(() => {
    const timeTaken = Math.floor((Date.now() - startTime) / 1000);
    const userAnswer = selectedAnswers.length > 0 ? selectedAnswers.join('') : '';
    onNext(isCorrect(), userAnswer, timeTaken);
  }, [startTime, selectedAnswers, onNext]);

  const getChoiceClass = (choice: string) => {
    if (!showResult) {
      return selectedAnswers.includes(choice) ? 'choice selected' : 'choice';
    }

    const isSelected = selectedAnswers.includes(choice);
    const isCorrectChoice = correctAnswers.includes(choice);

    if (isSelected && isCorrectChoice) return 'choice correct';
    if (isSelected && !isCorrectChoice) return 'choice incorrect';
    if (!isSelected && isCorrectChoice) return 'choice correct-highlight';
    return 'choice';
  };

  return (
    <div className="question-card">
      {/* Error: no valid choices and no image placeholders */}
      {!hasValidChoices && !hasImagePlaceholder ? (
        <div className="question-error">
          <h2><AlertTriangle size={20} style={{verticalAlign: 'middle', marginRight: 4}} /> Question Error</h2>
          <p>This question appears to be incomplete or missing answer choices.</p>
          <p><strong>Question {question.question_number}:</strong> {question.question_text}</p>
          <button className="next-btn" onClick={() => onNext(false, '', 0)}>
            Skip Question
          </button>
        </div>
      ) : !hasValidChoices && hasImagePlaceholder ? (
        <div className="question-error">
          <h2><ImageOff size={20} style={{verticalAlign: 'middle', marginRight: 4}} /> Image-Based Question</h2>
          <p>This question contains images with answer choices that are not available in the current dataset.</p>
          <p><strong>Question {question.question_number}:</strong></p>
          <div className="question-text">
            {renderTextWithImages(question.question_text, question.question_images || [])}
          </div>
          <p>The answer choices for this question are likely contained within the images above.</p>
          <button className="next-btn" onClick={() => onNext(false, '', 0)}>
            Skip Question
          </button>
        </div>
      ) : (
        <>
          <div className="question-header">
        <div className="header-left">
          <h2>Question {question.question_number}</h2>
          {onToggleBookmark && (
            <button
              className={`bookmark-btn ${isBookmarked ? 'bookmarked' : ''}`}
              onClick={() => onToggleBookmark(question.question_id)}
              aria-label={isBookmarked ? 'Remove bookmark' : 'Add bookmark'}
              title={isBookmarked ? 'Remove bookmark' : 'Bookmark this question'}
            >
              {isBookmarked ? <Bookmark size={16} /> : <BookmarkPlus size={16} />}
            </button>
          )}
        </div>
        <div className="header-right">
          {isMultipleAnswer && !showResult && (
            <span className="multiple-indicator">Multiple Answers</span>
          )}
          {showResult && (
            <>
              <div className={`result ${isCorrect() ? 'correct' : 'incorrect'}`}>
                {isCorrect() ? <><Check size={14} /> Correct!</> : <><X size={14} /> Incorrect</>}
              </div>
              {question.discussion && question.discussion.length > 0 && (
                <button 
                  className="discussions-btn"
                  onClick={() => setShowDiscussions(true)}
                  aria-label={`View discussions${question.discussion_count ? ` (${question.discussion_count})` : ''}`}
                >
                  <MessageCircle size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> Discussions {question.discussion_count && `(${question.discussion_count})`}
                </button>
              )}
              {showNextButton && (
                <button className="next-btn-header" onClick={handleNext}>
                  Next Question
                </button>
              )}
            </>
          )}
        </div>
      </div>
      
      <div className="question-text">
        {renderTextWithImages(question.question_text, question.question_images || [])}
      </div>

      <div className="choices">
        {shuffledChoices.map(({ key, value }) => (
          <div
            key={key}
            className={getChoiceClass(key)}
            onClick={() => handleAnswerClick(key)}
            role="button"
            tabIndex={isSubmitted ? -1 : 0}
            onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isSubmitted) { e.preventDefault(); handleAnswerClick(key); } }}
          >
            <span className="choice-label">{key}</span>
            <span className="choice-text">
              {renderTextWithImages(value, question.answer_images || [])}
            </span>
          </div>
        ))}
      </div>

      {isMultipleAnswer && !isSubmitted && selectedAnswers.length > 0 && (
        <button className="submit-btn" onClick={handleSubmit}>
          Submit Answer
        </button>
      )}

      {showDiscussions && (
        <Discussions
          discussions={question.discussion}
          discussionCount={question.discussion_count}
          questionText={question.question_text}
          questionNumber={question.question_number}
          onClose={() => setShowDiscussions(false)}
        />
      )}
        </>
      )}
    </div>
  );
});

QuestionCard.displayName = 'QuestionCard';

export default QuestionCard;