import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { Discussion, DiscussionComment } from '../types';
import { MessageCircle } from 'lucide-react';
import './Discussions.css';

interface DiscussionsProps {
  discussions?: Discussion[];
  discussionCount?: number;
  questionText?: string;
  questionNumber?: number;
  onClose: () => void;
}

const DiscussionThread: React.FC<{ comment: DiscussionComment; depth?: number }> = ({ comment, depth = 0 }) => {
  return (
    <div className={`discussion-comment depth-${Math.min(depth, 3)}`}>
      <div className="comment-header">
        <span className="comment-poster">{comment.poster}</span>
        {comment.timestamp && (
          <span className="comment-time">
            {new Date(parseFloat(comment.timestamp) * 1000).toLocaleDateString()}
          </span>
        )}
      </div>
      <div className="comment-content">
        <ReactMarkdown>{comment.content}</ReactMarkdown>
      </div>
      {comment.comments && comment.comments.length > 0 && (
        <div className="comment-replies">
          {comment.comments.map((reply, idx) => (
            <DiscussionThread key={idx} comment={reply} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
};

const Discussions: React.FC<DiscussionsProps> = ({ discussions, discussionCount, questionText, questionNumber, onClose }) => {
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  if (!discussions || discussions.length === 0) {
    return (
      <div className="discussions-panel" ref={panelRef}>
        <div className="discussions-header">
          <h3><MessageCircle size={16} style={{verticalAlign: 'middle', marginRight: 4}} /> Discussions</h3>
          <button className="close-btn" onClick={onClose}>✕</button>
        </div>
        {questionText && (
          <div className="question-preview">
            <div className="question-preview-label">Question</div>
            <div className="question-preview-text">{questionText}</div>
          </div>
        )}
        <div className="no-discussions">
          <p>No discussions available for this question.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="discussions-panel" ref={panelRef}>
      <div className="discussions-header">
        <h3><MessageCircle size={16} style={{verticalAlign: 'middle', marginRight: 4}} /> Discussions {discussionCount && `(${discussionCount})`}</h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>
      {questionText && (
        <div className="question-preview">
          <div className="question-preview-label">Question</div>
          <div className="question-preview-text">{questionText}</div>
        </div>
      )}
      <div className="discussions-content">
        {discussions.map((discussion, idx) => {
          // Handle case where discussion itself has content (top-level comment)
          const hasTopLevelContent = 'content' in discussion && discussion.content;
          
          return (
            <div key={idx} className="discussion-thread">
              {hasTopLevelContent && (
                <div className="discussion-comment depth-0">
                  <div className="comment-header">
                    <span className="comment-poster">{discussion.poster}</span>
                    {discussion.timestamp && (
                      <span className="comment-time">
                        {new Date(parseFloat(discussion.timestamp) * 1000).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                  <div className="comment-content">
                    <ReactMarkdown>{(discussion as any).content}</ReactMarkdown>
                  </div>
                  {discussion.comments && discussion.comments.length > 0 && (
                    <div className="comment-replies">
                      {discussion.comments.map((reply, replyIdx) => (
                        <DiscussionThread key={replyIdx} comment={reply} depth={1} />
                      ))}
                    </div>
                  )}
                </div>
              )}
              {!hasTopLevelContent && discussion.comments && discussion.comments.length > 0 && (
                <div className="thread-comments">
                  {discussion.comments.map((comment, commentIdx) => (
                    <DiscussionThread key={commentIdx} comment={comment} />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default Discussions;
