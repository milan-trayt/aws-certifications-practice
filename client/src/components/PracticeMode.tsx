import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Question } from '../types';
import Discussions from './Discussions';
import Pagination from './Pagination';
import { bookmarkService } from '../services/bookmarkService';
import { usePaginationScroll } from '../hooks/useScrollManagement';
import { QUESTIONS_PER_PAGE } from '../constants';
import { BookOpen, Bookmark, BookmarkPlus, ImageOff, Check, X, MessageCircle } from 'lucide-react';
import './PracticeMode.css';

interface PracticeModeProps {
  questions: Question[];
  testName: string;
  testId?: string;
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

const PracticeMode: React.FC<PracticeModeProps> = ({ questions, testName, testId }) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [answeredQuestions, setAnsweredQuestions] = useState<Set<number>>(new Set());
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string[]>>({});
  const [shuffledChoices, setShuffledChoices] = useState<Record<number, ShuffledChoice[]>>({});
  const [pageInput, setPageInput] = useState('');
  const [showDiscussions, setShowDiscussions] = useState<number | null>(null);
  const [bookmarkedIds, setBookmarkedIds] = useState<Set<string>>(new Set());
  
  // Scroll management for pagination
  const { handlePageChange } = usePaginationScroll();

  // Load bookmarks for this test
  useEffect(() => {
    if (!testId) return;
    bookmarkService.getBookmarks(testId).then(bookmarks => {
      setBookmarkedIds(new Set(bookmarks.map(b => b.questionId)));
    }).catch(() => {});
  }, [testId]);

  const handleToggleBookmark = useCallback(async (questionId: string) => {
    const wasBookmarked = bookmarkedIds.has(questionId);
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
      setBookmarkedIds(prev => {
        const next = new Set(prev);
        if (wasBookmarked) next.add(questionId);
        else next.delete(questionId);
        return next;
      });
    }
  }, [bookmarkedIds]);

  const questionsPerPage = QUESTIONS_PER_PAGE;
  const totalPages = useMemo(() => Math.ceil(questions.length / questionsPerPage), [questions.length]);
  const startIndex = (currentPage - 1) * questionsPerPage;
  const endIndex = startIndex + questionsPerPage;
  const currentQuestions = useMemo(() => questions.slice(startIndex, endIndex), [questions, startIndex, endIndex]);

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

  // Initialize shuffled choices for current page questions
  useEffect(() => {
    const newShuffledChoices: Record<number, ShuffledChoice[]> = {};
    
    currentQuestions.forEach((question, index) => {
      const questionIndex = startIndex + index;
      if (!shuffledChoices[questionIndex]) {
        const choicesArray = Object.entries(question.choices).map(([key, value]) => ({
          key,
          value
        }));
        newShuffledChoices[questionIndex] = shuffleArray(choicesArray);
      }
    });
    
    setShuffledChoices(prev => ({ ...prev, ...newShuffledChoices }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, questions]);

  const handleAnswerClick = useCallback((questionIndex: number, choice: string) => {
    const question = questions[questionIndex];
    const correctAnswers = question.correct_answer.split('');
    const isMultipleAnswer = correctAnswers.length > 1;

    if (isMultipleAnswer) {
      setSelectedAnswers(prev => {
        const current = prev[questionIndex] || [];
        const updated = current.includes(choice)
          ? current.filter(a => a !== choice)
          : [...current, choice];
        return { ...prev, [questionIndex]: updated };
      });
    } else {
      setSelectedAnswers(prev => ({ ...prev, [questionIndex]: [choice] }));
      setAnsweredQuestions(prev => {
        const newSet = new Set(prev);
        newSet.add(questionIndex);
        return newSet;
      });
    }
  }, [questions]);

  const handleSubmitMultiple = useCallback((questionIndex: number) => {
    setAnsweredQuestions(prev => {
      const newSet = new Set(prev);
      newSet.add(questionIndex);
      return newSet;
    });
  }, []);

  const isCorrect = (questionIndex: number) => {
    const question = questions[questionIndex];
    const selected = selectedAnswers[questionIndex] || [];
    const correctAnswers = question.correct_answer.split('');
    
    if (selected.length === 0) return false;
    
    if (correctAnswers.length > 1) {
      return selected.length === correctAnswers.length && 
             selected.every(answer => correctAnswers.includes(answer));
    } else {
      return selected[0] === question.correct_answer;
    }
  };

  const getChoiceClass = (questionIndex: number, choice: string) => {
    const question = questions[questionIndex];
    const isAnswered = answeredQuestions.has(questionIndex);
    const selected = selectedAnswers[questionIndex] || [];
    const correctAnswers = question.correct_answer.split('');
    
    if (!isAnswered) {
      return selected.includes(choice) ? 'choice selected' : 'choice';
    }

    const isSelected = selected.includes(choice);
    const isCorrectChoice = correctAnswers.includes(choice);

    if (isSelected && isCorrectChoice) return 'choice correct';
    if (isSelected && !isCorrectChoice) return 'choice incorrect';
    if (!isSelected && isCorrectChoice) return 'choice correct-highlight';
    return 'choice';
  };

  const goToPage = useCallback((page: number) => {
    handlePageChange(() => {
      setCurrentPage(page);
      setPageInput(''); // Clear input when navigating
    });
  }, [handlePageChange]);

  const handlePageInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setPageInput(e.target.value);
  }, []);

  const handlePageInputSubmit = useCallback((e: React.FormEvent) => {
    e.preventDefault();
    const page = parseInt(pageInput);
    if (page >= 1 && page <= totalPages) {
      goToPage(page);
    } else {
      setPageInput(''); // Clear invalid input
    }
  }, [pageInput, totalPages, goToPage]);

  const handlePageInputValueChange = useCallback((value: string) => setPageInput(value), []);

  // Pagination component props
  const paginationProps = {
    currentPage,
    totalPages,
    onPageChange: goToPage,
    pageInput,
    onPageInputChange: handlePageInputValueChange,
    onPageInputSubmit: handlePageInputSubmit
  };

  return (
    <div className="practice-mode" id="practice-mode-container">
      <div className="practice-header">
        <h2><BookOpen size={20} style={{verticalAlign: 'middle', marginRight: 4}} /> {testName} - Practice Mode</h2>
        <div className="page-info">
          Page {currentPage} of {totalPages} • Questions {startIndex + 1}-{Math.min(endIndex, questions.length)} of {questions.length}
        </div>
      </div>

      {/* Top Pagination */}
      <Pagination {...paginationProps} className="pagination-top" />

      <div className="questions-list" id="questions-container">
        {currentQuestions.map((question, index) => {
          const questionIndex = startIndex + index;
          const correctAnswers = question.correct_answer.split('');
          const isMultipleAnswer = correctAnswers.length > 1;
          const isAnswered = answeredQuestions.has(questionIndex);
          const selected = selectedAnswers[questionIndex] || [];
          
          // Check if question has valid choices
          const hasValidChoices = Object.values(question.choices).some(choice => choice.trim().length > 0);
          const hasImagePlaceholder = question.question_text.includes('//IMG//');

          // Handle questions with no valid text choices but image placeholders
          if (!hasValidChoices && hasImagePlaceholder) {
            return (
              <div key={question.question_id} className="practice-question">
                <div className="question-header">
                  <h3>Question {question.question_number}</h3>
                  <span className="result-indicator incorrect"><ImageOff size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> Image-Based</span>
                </div>
                
                <div className="question-text">
                  {renderTextWithImages(question.question_text, question.question_images || [])}
                </div>

                <div className="question-error">
                  <p>This question contains images with answer choices that are not available in the current dataset.</p>
                  <p>The answer choices for this question are likely contained within the images above.</p>
                </div>
              </div>
            );
          }

          // Skip questions with no valid choices and no image placeholders
          if (!hasValidChoices) {
            return null;
          }

          return (
            <div key={question.question_id} className="practice-question">
              <div className="question-header">
                <div className="question-header-left">
                  <h3>Question {question.question_number}</h3>
                  {testId && (
                    <button
                      className={`bookmark-btn ${bookmarkedIds.has(question.question_id) ? 'bookmarked' : ''}`}
                      onClick={() => handleToggleBookmark(question.question_id)}
                      aria-label={bookmarkedIds.has(question.question_id) ? 'Remove bookmark' : 'Add bookmark'}
                      title={bookmarkedIds.has(question.question_id) ? 'Remove bookmark' : 'Bookmark this question'}
                    >
                      {bookmarkedIds.has(question.question_id) ? <Bookmark size={14} /> : <BookmarkPlus size={14} />}
                    </button>
                  )}
                </div>
                <div className="question-header-actions">
                  {isMultipleAnswer && (
                    <span className="multiple-indicator">Multiple Answers</span>
                  )}
                  {isAnswered && (
                    <>
                      <span className={`result-indicator ${isCorrect(questionIndex) ? 'correct' : 'incorrect'}`}>
                        {isCorrect(questionIndex) ? <><Check size={12} /> Correct</> : <><X size={12} /> Incorrect</>}
                      </span>
                      {question.discussion && question.discussion.length > 0 && (
                        <button 
                          className="discussions-btn"
                          onClick={() => setShowDiscussions(questionIndex)}
                        >
                          <MessageCircle size={12} style={{verticalAlign: 'middle', marginRight: 4}} /> Discussions {question.discussion_count && `(${question.discussion_count})`}
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
                {shuffledChoices[questionIndex]?.map(({ key, value }) => (
                  <div
                    key={key}
                    className={getChoiceClass(questionIndex, key)}
                    onClick={() => !isAnswered && handleAnswerClick(questionIndex, key)}
                    role="button"
                    tabIndex={isAnswered ? -1 : 0}
                    onKeyDown={e => { if ((e.key === 'Enter' || e.key === ' ') && !isAnswered) { e.preventDefault(); handleAnswerClick(questionIndex, key); } }}
                  >
                    <span className="choice-label">{key}</span>
                    <span className="choice-text">
                      {renderTextWithImages(value, question.answer_images || [])}
                    </span>
                  </div>
                ))}
              </div>

              {isMultipleAnswer && !isAnswered && selected.length > 0 && (
                <button 
                  className="submit-btn" 
                  onClick={() => handleSubmitMultiple(questionIndex)}
                >
                  Submit Answer
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Bottom Pagination */}
      <Pagination {...paginationProps} className="pagination-bottom" />

      {showDiscussions !== null && (
        <Discussions
          discussions={questions[showDiscussions]?.discussion}
          discussionCount={questions[showDiscussions]?.discussion_count}
          questionText={questions[showDiscussions]?.question_text}
          questionNumber={questions[showDiscussions]?.question_number}
          onClose={() => setShowDiscussions(null)}
        />
      )}
    </div>
  );
};

export default PracticeMode;

export {};