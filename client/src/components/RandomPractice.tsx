import React, { useState, useEffect, useRef, useCallback } from 'react';
import QuestionCard from './QuestionCard';
import QuizStats from './QuizStats';
import { Question } from '../types';
import { bookmarkService } from '../services/bookmarkService';
import './RandomPractice.css';

interface RandomPracticeProps {
  questions: Question[];
  testName: string;
  testId?: string;
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

const RandomPractice: React.FC<RandomPracticeProps> = ({ questions, testName, testId }) => {
  const [shuffledQuestions, setShuffledQuestions] = useState<Question[]>([]);
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);
  const [correctAnswers, setCorrectAnswers] = useState(0);
  const [answeredQuestions, setAnsweredQuestions] = useState(0);
  const [currentAnswerProcessed, setCurrentAnswerProcessed] = useState(false);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  
  const containerRef = useRef<HTMLDivElement>(null);

  const initializeQuestions = () => {
    // Randomize the order of questions
    const shuffled = shuffleArray(questions);
    setShuffledQuestions(shuffled);
    setCurrentAnswerProcessed(false);
  };

  useEffect(() => {
    initializeQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [questions]);

  // Load bookmarks for this test
  useEffect(() => {
    if (!testId) return;
    bookmarkService.getBookmarks(testId).then(bookmarks => {
      setBookmarkedIds(new Set(bookmarks.map(b => b.questionId)));
    }).catch(() => {});
  }, [testId]);

  const handleToggleBookmark = useCallback(async (questionId: string) => {
    const wasBookmarked = bookmarkedIds.has(questionId);
    // Optimistic update
    setBookmarkedIds(prev => {
      const next = new Set(prev);
      if (wasBookmarked) next.delete(questionId);
      else next.add(questionId);
      return next;
    });
    try {
      if (wasBookmarked) {
        await bookmarkService.removeBookmark(questionId);
      } else {
        await bookmarkService.addBookmark(questionId);
      }
    } catch {
      // Revert on failure
      setBookmarkedIds(prev => {
        const next = new Set(prev);
        if (wasBookmarked) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
    }
  }, [bookmarkedIds]);

  // Reset answer processed flag when question changes
  useEffect(() => {
    setCurrentAnswerProcessed(false);
  }, [currentQuestionIndex]);

  const processAnswer = (isCorrect: boolean) => {
    if (currentAnswerProcessed) return; // Prevent double processing
    
    setCurrentAnswerProcessed(true);
    setAnsweredQuestions(prev => prev + 1);
    
    if (isCorrect) {
      setCorrectAnswers(prev => prev + 1);
    }
  };

  const handleNextQuestion = useCallback((isCorrect: boolean) => {
    // Process answer if not already processed
    if (!currentAnswerProcessed) {
      processAnswer(isCorrect);
    }
    
    if (currentQuestionIndex < shuffledQuestions.length - 1) {
      setCurrentQuestionIndex(prev => prev + 1);
    } else {
      // Quiz completed
      const finalCorrect = currentAnswerProcessed ? correctAnswers : (isCorrect ? correctAnswers + 1 : correctAnswers);
      const finalAnswered = currentAnswerProcessed ? answeredQuestions : answeredQuestions + 1;
      alert(`Quiz completed! You got ${finalCorrect} out of ${finalAnswered} questions correct. Accuracy: ${Math.round((finalCorrect / finalAnswered) * 100)}%`);
    }
  }, [currentAnswerProcessed, currentQuestionIndex, shuffledQuestions.length, correctAnswers, answeredQuestions]);

  // New callback for immediate answer processing
  const handleAnswerSubmitted = useCallback((isCorrect: boolean) => {
    processAnswer(isCorrect);
  }, [currentAnswerProcessed]);

  const handleRestart = useCallback(() => {
    setCurrentQuestionIndex(0);
    setCorrectAnswers(0);
    setAnsweredQuestions(0);
    setCurrentAnswerProcessed(false);
    // Re-randomize questions on restart
    initializeQuestions();
  }, []);

  if (shuffledQuestions.length === 0) {
    return (
      <div className="loading">Loading questions...</div>
    );
  }

  return (
    <div className="random-practice" ref={containerRef} id="random-practice-container">
      <QuizStats
        currentQuestion={answeredQuestions}
        totalQuestions={shuffledQuestions.length}
        correctAnswers={correctAnswers}
        onRestart={handleRestart}
        testName={testName}
      />
      
      {currentQuestionIndex < shuffledQuestions.length && (
        <div id="current-question-container">
          <QuestionCard
            key={`random-question-card`}
            question={shuffledQuestions[currentQuestionIndex]}
            onNext={handleNextQuestion}
            onAnswerSubmitted={handleAnswerSubmitted}
            isBookmarked={bookmarkedIds.has(shuffledQuestions[currentQuestionIndex]?.question_id)}
            onToggleBookmark={testId ? handleToggleBookmark : undefined}
          />
        </div>
      )}
    </div>
  );
};

export default RandomPractice;

export {};