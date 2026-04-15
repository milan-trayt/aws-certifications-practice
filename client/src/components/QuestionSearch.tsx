import React, { useState, useEffect, useRef, useCallback } from 'react';
import { apiClient, handleApiError } from '../services/api';
import { Question } from '../types';
import { Search } from 'lucide-react';
import './QuestionSearch.css';

interface QuestionSearchProps {
  testId: string;
  testName: string;
}

interface SearchResponse {
  data: {
    test: { id: string; name: string };
    questions: Question[];
    totalResults: number;
    searchQuery: string;
  };
}

/**
 * Highlights all occurrences of `term` within `text` by wrapping matches
 * in <mark> elements. Matching is case-insensitive.
 */
function highlightText(text: string, term: string): React.ReactNode {
  if (!term.trim()) return text;

  // Escape special regex characters in the search term
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  const parts = text.split(regex);

  return parts.map((part, i) =>
    regex.test(part) ? (
      <mark key={i} className="search-highlight">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

const QuestionSearch: React.FC<QuestionSearchProps> = ({ testId, testName }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Question[]>([]);
  const [totalResults, setTotalResults] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const search = useCallback(
    async (searchTerm: string) => {
      if (!searchTerm.trim()) {
        setResults([]);
        setTotalResults(null);
        setError('');
        return;
      }

      try {
        setIsLoading(true);
        setError('');
        const res = await apiClient.get(
          `/tests/${testId}/questions/search`,
          { params: { q: searchTerm.trim() } }
        );
        const responseData = res.data.data || res.data;
        setResults(responseData.questions || []);
        setTotalResults(responseData.totalResults ?? 0);
      } catch (err: any) {
        setError(handleApiError(err));
        setResults([]);
        setTotalResults(null);
      } finally {
        setIsLoading(false);
      }
    },
    [testId]
  );

  // Debounce search input by 350ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    debounceRef.current = setTimeout(() => {
      search(query);
    }, 350);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, search]);

  const handleClear = () => {
    setQuery('');
    setResults([]);
    setTotalResults(null);
    setError('');
  };

  return (
    <div className="question-search">
      <div className="question-search-header">
        <h2><Search size={20} style={{verticalAlign: 'middle', marginRight: 4}} /> Search Questions — {testName}</h2>
      </div>

      <div className="search-input-wrapper">
        <input
          type="text"
          className="search-input"
          placeholder="Search questions by keyword…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-label="Search questions"
          maxLength={200}
        />
        {query && (
          <button
            className="search-clear-btn"
            onClick={handleClear}
            aria-label="Clear search"
          >
            ✕
          </button>
        )}
      </div>

      {isLoading && (
        <div className="search-status">Searching…</div>
      )}

      {error && <div className="search-error">{error}</div>}

      {!isLoading && !error && totalResults !== null && (
        <div className="search-results-info">
          {totalResults === 0
            ? 'No results found'
            : `${totalResults} question${totalResults !== 1 ? 's' : ''} found`}
        </div>
      )}

      {results.length > 0 && (
        <ul className="search-results-list">
          {results.map((q) => (
            <li key={q.question_id} className="search-result-item">
              <div className="search-result-number">
                Q{q.question_number}
              </div>
              <div className="search-result-text">
                {highlightText(q.question_text, query)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default QuestionSearch;
