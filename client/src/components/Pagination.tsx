import React, { useMemo } from 'react';
import './Pagination.css';

interface PaginationProps {
  currentPage: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  pageInput: string;
  onPageInputChange: (value: string) => void;
  onPageInputSubmit: (e: React.FormEvent) => void;
  className?: string;
}

const Pagination: React.FC<PaginationProps> = React.memo(({
  currentPage,
  totalPages,
  onPageChange,
  pageInput,
  onPageInputChange,
  onPageInputSubmit,
  className = ''
}) => {
  const paginationButtons = useMemo(() => {
    const buttons = [];
    const maxVisible = 5;
    
    let startPage = Math.max(1, currentPage - Math.floor(maxVisible / 2));
    let endPage = Math.min(totalPages, startPage + maxVisible - 1);
    
    if (endPage - startPage + 1 < maxVisible) {
      startPage = Math.max(1, endPage - maxVisible + 1);
    }

    if (startPage > 1) {
      buttons.push(
        <button key={1} className="page-btn" onClick={() => onPageChange(1)}>1</button>
      );
      if (startPage > 2) {
        buttons.push(<span key="start-ellipsis" className="ellipsis">...</span>);
      }
    }

    for (let i = startPage; i <= endPage; i++) {
      buttons.push(
        <button
          key={i}
          className={`page-btn ${currentPage === i ? 'active' : ''}`}
          onClick={() => onPageChange(i)}
        >
          {i}
        </button>
      );
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        buttons.push(<span key="end-ellipsis" className="ellipsis">...</span>);
      }
      buttons.push(
        <button key={totalPages} className="page-btn" onClick={() => onPageChange(totalPages)}>
          {totalPages}
        </button>
      );
    }

    return buttons;
  }, [currentPage, totalPages, onPageChange]);

  return (
    <nav className={`pagination ${className}`} aria-label="Pagination">
      <button 
        className="nav-btn prev-btn" 
        onClick={() => onPageChange(currentPage - 1)}
        disabled={currentPage === 1}
        aria-label="Previous page"
      >
        ← Previous
      </button>
      
      <div className="page-buttons">
        {paginationButtons}
        <form onSubmit={onPageInputSubmit} className="page-input-form">
          <input
            type="number"
            min="1"
            max={totalPages}
            value={pageInput}
            onChange={(e) => onPageInputChange(e.target.value)}
            placeholder={`Go to page (1-${totalPages})`}
            className="page-input"
            aria-label={`Go to page, 1 to ${totalPages}`}
          />
          <button type="submit" className="page-input-btn">Go</button>
        </form>
      </div>
      
      <button 
        className="nav-btn next-btn" 
        onClick={() => onPageChange(currentPage + 1)}
        disabled={currentPage === totalPages}
        aria-label="Next page"
      >
        Next →
      </button>
    </nav>
  );
});

Pagination.displayName = 'Pagination';

export default Pagination;
