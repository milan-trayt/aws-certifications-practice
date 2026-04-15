import React, { useState, useEffect, useCallback } from 'react';
import { bookmarkService, Bookmark } from '../services/bookmarkService';
import Discussions from './Discussions';
import { Bookmark as BookmarkIcon, BookmarkPlus, X, Check, MessageCircle, ChevronDown, ChevronUp } from 'lucide-react';
import './BookmarkedQuestions.css';

interface BookmarkedQuestionsProps {
  testId: string;
  testName: string;
}

const BookmarkedQuestions: React.FC<BookmarkedQuestionsProps> = ({ testId, testName }) => {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedIds, setExpandedIds] = useState<Set<number>>(new Set());
  const [revealedIds, setRevealedIds] = useState<Set<number>>(new Set());
  const [showDiscussions, setShowDiscussions] = useState<number | null>(null);

  const loadBookmarks = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const data = await bookmarkService.getBookmarks(testId);
      setBookmarks(data);
    } catch {
      setError('Failed to load bookmarks.');
    } finally {
      setIsLoading(false);
    }
  }, [testId]);

  useEffect(() => { loadBookmarks(); }, [loadBookmarks]);

  const handleRemove = async (questionId: string) => {
    const prev = bookmarks;
    setBookmarks(b => b.filter(bm => bm.questionId !== questionId));
    try { await bookmarkService.removeBookmark(questionId); }
    catch { setBookmarks(prev); }
  };

  const toggleExpand = (id: number) => {
    setExpandedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleReveal = (id: number) => {
    setRevealedIds(prev => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const renderTextWithImages = (text: string, images: string[] = []) => {
    const parts = text.split('//IMG//');
    return parts.map((part, index) => (
      <React.Fragment key={index}>
        {part.split('\n').map((line, i) => (
          <React.Fragment key={i}>{line}{i < part.split('\n').length - 1 && <br />}</React.Fragment>
        ))}
        {index < parts.length - 1 && (
          images[index]
            ? <div className="bm-image-container"><img src={images[index]} alt={`Image ${index + 1}`} className="bm-image" /></div>
            : <div className="bm-missing-image">Image not available</div>
        )}
      </React.Fragment>
    ));
  };

  if (isLoading) {
    return <div className="bookmarked-questions"><div className="loading">Loading bookmarks...</div></div>;
  }

  return (
    <div className="bookmarked-questions">
      <div className="bookmarks-header">
        <h2><BookmarkIcon size={20} style={{verticalAlign: 'middle', marginRight: 4}} /> {testName} - Bookmarked Questions</h2>
        <span className="bookmarks-count">{bookmarks.length} bookmarked</span>
      </div>

      {error && <div className="error-banner">{error}</div>}

      {bookmarks.length === 0 ? (
        <div className="bookmarks-empty">
          <p>No bookmarked questions yet.</p>
          <p>Use the <BookmarkPlus size={14} style={{verticalAlign: 'middle'}} /> button on any question to bookmark it.</p>
        </div>
      ) : (
        <div className="bookmarks-list">
          {bookmarks.map(bookmark => {
            const isExpanded = expandedIds.has(bookmark.id);
            const isRevealed = revealedIds.has(bookmark.id);
            const correctKeys = bookmark.correctAnswer.split('');

            return (
              <div key={bookmark.id} className={`bookmark-item ${isExpanded ? 'expanded' : ''}`}>
                <div className="bookmark-item-header" onClick={() => toggleExpand(bookmark.id)}>
                  <span className="bookmark-question-number">Q{bookmark.questionNumber}</span>
                  <span className="bookmark-question-preview">
                    {bookmark.questionText.length > 120 && !isExpanded
                      ? bookmark.questionText.substring(0, 120) + '...'
                      : bookmark.questionText.substring(0, 120)}
                  </span>
                  <div className="bookmark-header-actions">
                    {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    <button
                      className="bookmark-remove-btn"
                      onClick={(e) => { e.stopPropagation(); handleRemove(bookmark.questionId); }}
                      aria-label="Remove bookmark"
                      title="Remove bookmark"
                    >
                      <X size={14} />
                    </button>
                  </div>
                </div>

                {isExpanded && (
                  <div className="bookmark-expanded-content">
                    <div className="bookmark-full-question">
                      {renderTextWithImages(bookmark.questionText, bookmark.questionImages || [])}
                    </div>

                    <div className="bookmark-choices">
                      {Object.entries(bookmark.choices || {}).filter(([, v]) => v && v.trim()).map(([key, value]) => (
                        <div
                          key={key}
                          className={`bookmark-choice ${isRevealed ? (correctKeys.includes(key) ? 'correct' : '') : ''}`}
                        >
                          <span className="bookmark-choice-key">{key}.</span>
                          <span className="bookmark-choice-value">
                            {renderTextWithImages(value, bookmark.answerImages || [])}
                          </span>
                          {isRevealed && correctKeys.includes(key) && (
                            <Check size={14} className="bookmark-correct-icon" />
                          )}
                        </div>
                      ))}
                    </div>

                    <div className="bookmark-actions">
                      <button className="bookmark-reveal-btn" onClick={() => toggleReveal(bookmark.id)}>
                        {isRevealed ? 'Hide Answer' : 'Show Answer'}
                      </button>
                      {bookmark.discussion && bookmark.discussion.length > 0 && (
                        <button className="bookmark-discussions-btn" onClick={() => setShowDiscussions(bookmark.id)}>
                          <MessageCircle size={14} style={{verticalAlign: 'middle', marginRight: 4}} />
                          Discussions {bookmark.discussionCount ? `(${bookmark.discussionCount})` : ''}
                        </button>
                      )}
                      <span className="bookmark-date">
                        Bookmarked {new Date(bookmark.createdAt).toLocaleDateString()}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {showDiscussions !== null && (() => {
        const bm = bookmarks.find(b => b.id === showDiscussions);
        return bm ? (
          <Discussions
            discussions={bm.discussion}
            discussionCount={bm.discussionCount}
            questionText={bm.questionText}
            questionNumber={bm.questionNumber}
            onClose={() => setShowDiscussions(null)}
          />
        ) : null;
      })()}
    </div>
  );
};

export default BookmarkedQuestions;
