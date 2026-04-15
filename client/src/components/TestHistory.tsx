import React, { useState, useEffect, useMemo } from 'react';
import { progressService } from '../services/progressService';
import { useAuth } from '../contexts/AuthContext';
import MockTestReview from './MockTestReview';
import PDFExportButton from './PDFExportButton';
import { CheckCircle, XCircle } from 'lucide-react';
import './TestHistory.css';

interface TestHistoryProps {
  testName: string;
  testId: string;
}

interface MockTestResult {
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
}

const TestHistory: React.FC<TestHistoryProps> = ({ testName, testId }) => {
  const { user } = useAuth();
  const [mockTestHistory, setMockTestHistory] = useState<MockTestResult[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');
  const [selectedMockTest, setSelectedMockTest] = useState<number | null>(null);

  useEffect(() => {
    loadHistory();
  }, [testId]);

  const loadHistory = async () => {
    try {
      setIsLoading(true);
      setError('');

      // Load mock test history
      const mockHistory = await progressService.getMockTestHistory(1, 50);
      const filteredMockTests = mockHistory.mockTests.filter(test => test.testId === testId);
      setMockTestHistory(filteredMockTests);

    } catch (error: any) {
      console.error('Error loading history:', error);
      setError('Failed to load test history. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  const loadMockTestDetails = async (mockTestId: number) => {
    setSelectedMockTest(mockTestId);
  };

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

  const historyStats = useMemo(() => ({
    totalTests: mockTestHistory.length,
    averageScore: mockTestHistory.length > 0
      ? Math.round(mockTestHistory.reduce((sum, test) => sum + test.percentage, 0) / mockTestHistory.length)
      : 0,
    testsPassed: mockTestHistory.filter(test => test.passed).length
  }), [mockTestHistory]);

  if (isLoading) {
    return (
      <div className="test-history">
        <div className="loading">Loading test history...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="test-history">
        <div className="error-message">
          <p>{error}</p>
          <button onClick={loadHistory}>Retry</button>
        </div>
      </div>
    );
  }

  if (selectedMockTest) {
    return (
      <MockTestReview 
        mockTestId={selectedMockTest} 
        onClose={() => setSelectedMockTest(null)} 
      />
    );
  }

  return (
    <div className="test-history">
      <div className="history-header">
        <div className="history-title-row">
          <h2>Test History - {testName}</h2>
          <PDFExportButton
            testName={testName}
            userName={user ? `${user.firstName ?? ''} ${user.lastName ?? ''}`.trim() || user.email : 'Unknown User'}
            mockTestHistory={mockTestHistory}
          />
        </div>
        <div className="history-stats">
          <div className="stat-item">
            <span className="stat-value">{historyStats.totalTests}</span>
            <span className="stat-label">Mock Tests Completed</span>
          </div>
          {mockTestHistory.length > 0 && (
            <>
              <div className="stat-item">
                <span className="stat-value">
                  {historyStats.averageScore}%
                </span>
                <span className="stat-label">Average Score</span>
              </div>
              <div className="stat-item">
                <span className="stat-value">
                  {historyStats.testsPassed}
                </span>
                <span className="stat-label">Tests Passed</span>
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mock-test-history">
        {mockTestHistory.length === 0 ? (
          <div className="no-history">
            <p>No mock tests completed yet.</p>
            <p>Complete a mock test to see your results here.</p>
          </div>
        ) : (
          <div className="mock-test-list">
            {mockTestHistory.map((test) => (
              <div key={test.id} className={`mock-test-card ${test.passed ? 'passed' : 'failed'}`}>
                <div className="test-score">
                  <span className="score">{test.scaledScore}/1000</span>
                  <span className="percentage">{test.score}/{test.totalQuestions} ({test.percentage}%)</span>
                  <span className={`status ${test.passed ? 'passed' : 'failed'}`}>
                    {test.passed ? <><CheckCircle size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> PASSED</> : <><XCircle size={12} style={{verticalAlign: 'middle', marginRight: 2}} /> FAILED</>}
                  </span>
                </div>
                <div className="test-details">
                  <span>{formatDate(test.completedAt)}</span>
                  <span>•</span>
                  <span>{formatTime(test.timeSpent)}</span>
                  <span>•</span>
                  <span>Passing: {test.passingScore}/1000</span>
                </div>
                <button 
                  className="view-details-btn"
                  onClick={() => loadMockTestDetails(test.id)}
                >
                  View Details
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default TestHistory;