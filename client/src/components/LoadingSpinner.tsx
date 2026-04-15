import React from 'react';
import './LoadingSpinner.css';

const LoadingSpinner: React.FC = () => (
  <div className="loading-spinner-container" role="status" aria-label="Loading">
    <div className="loading-spinner" />
    <span className="loading-spinner-text">Loading...</span>
  </div>
);

export default LoadingSpinner;
