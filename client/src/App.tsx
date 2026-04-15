import React, { useState, useEffect, Suspense } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { ThemeProvider, useTheme } from './contexts/ThemeContext';
import AuthPage from './pages/AuthPage';
import ProtectedRoute from './components/auth/ProtectedRoute';
import ErrorBoundary from './components/ErrorBoundary';
import LoadingSpinner from './components/LoadingSpinner';
import SkipLink from './components/SkipLink';
import TabNavigation, { TabType } from './components/TabNavigation';
import TestSelector from './components/TestSelector';
import RandomPractice from './components/RandomPractice';
import { Question, TestMetadata } from './types';
import { testService } from './services/testService';
import { Moon, Sun, Monitor, BarChart3, Timer, Target } from 'lucide-react';
import './App.css';

// Lazy-loaded route-level components
const FullMockTest = React.lazy(() => import('./components/FullMockTest'));
const MockTest = React.lazy(() => import('./components/MockTest'));
const PracticeMode = React.lazy(() => import('./components/PracticeMode'));
const StudyMode = React.lazy(() => import('./components/StudyMode'));
const TestHistory = React.lazy(() => import('./components/TestHistory'));
const UserProfile = React.lazy(() => import('./components/UserProfile'));
const BookmarkedQuestions = React.lazy(() => import('./components/BookmarkedQuestions'));
const QuestionSearch = React.lazy(() => import('./components/QuestionSearch'));
const SpacedRepetitionMode = React.lazy(() => import('./components/SpacedRepetitionMode'));

// Main app content (protected)
const AppContent: React.FC = () => {
  const [questions, setQuestions] = useState<Question[]>([]);
  const [activeTab, setActiveTab] = useState<TabType>('random');
  const [availableTests, setAvailableTests] = useState<TestMetadata[]>([]);
  const [selectedTest, setSelectedTest] = useState<TestMetadata | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  // Load available tests on component mount
  useEffect(() => {
    const loadTests = async () => {
      try {
        setIsLoading(true);
        setError('');
        
        // Get all tests (with high limit to get all at once)
        const response = await testService.getTests(1, 100);
        setAvailableTests(response.tests);
        
        // Try to restore saved test and tab from localStorage
        const savedTestId = localStorage.getItem('selectedTestId');
        const savedTab = localStorage.getItem('activeTab') as TabType;
        
        if (savedTestId && response.tests.length > 0) {
          const savedTest = response.tests.find(test => test.id === savedTestId);
          if (savedTest) {
            setSelectedTest(savedTest);
          }
        }
        
        if (savedTab && ['random', 'mock', 'fullmock', 'practice', 'study', 'spaced-repetition', 'history', 'bookmarks', 'search'].includes(savedTab)) {
          setActiveTab(savedTab);
        }
        
      } catch (error: any) {
        console.error('Error loading tests:', error);
        setError('Failed to load tests. Please try again.');
      } finally {
        setIsLoading(false);
      }
    };

    loadTests();
  }, []);

  // Load questions when test is selected
  useEffect(() => {
    if (selectedTest) {
      loadTestQuestions(selectedTest);
    }
  }, [selectedTest]);

  const loadTestQuestions = async (test: TestMetadata) => {
    try {
      setIsLoading(true);
      setError('');
      
      // Try to get cached questions first
      const cachedQuestions = testService.getCachedQuestions(test.id);
      if (cachedQuestions && cachedQuestions.length > 0) {
        const validQuestions = testService.filterValidQuestions(cachedQuestions);
        setQuestions(validQuestions);
        setIsLoading(false);
        return;
      }
      
      // Load all questions for the test
      const response = await testService.getAllQuestions(test.id);
      const validQuestions = testService.filterValidQuestions(response.questions);
      
      setQuestions(validQuestions);
      
      // Cache questions for offline support
      testService.cacheQuestions(test.id, validQuestions);
      
    } catch (error: any) {
      console.error('Error loading questions:', error);
      setError('Failed to load questions. Please try again.');
      
      // Try to use cached questions as fallback
      const cachedQuestions = testService.getCachedQuestions(test.id);
      if (cachedQuestions && cachedQuestions.length > 0) {
        const validQuestions = testService.filterValidQuestions(cachedQuestions);
        setQuestions(validQuestions);
        setError('Using cached questions (offline mode)');
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleTabChange = (tab: TabType) => {
    setActiveTab(tab);
    // Save tab to localStorage
    localStorage.setItem('activeTab', tab);
  };

  const handleTestSelect = (test: TestMetadata) => {
    setSelectedTest(test);
    setActiveTab('random'); // Reset to first tab when changing tests
    // Save test selection to localStorage
    localStorage.setItem('selectedTestId', test.id);
    localStorage.setItem('activeTab', 'random');
  };

  const handleChangeTest = () => {
    setSelectedTest(null);
    setQuestions([]);
    // Clear saved test from localStorage
    localStorage.removeItem('selectedTestId');
    localStorage.removeItem('activeTab');
  };

  const handleLogout = () => {
    logout();
  };

  if (isLoading && !selectedTest) {
    return (
      <div className="App">
        <div className="loading">Loading...</div>
      </div>
    );
  }

  if (error && !selectedTest && availableTests.length === 0) {
    return (
      <div className="App">
        <div className="error-container">
          <div className="error-message">
            <h2>Error Loading Application</h2>
            <p>{error}</p>
            <button onClick={() => window.location.reload()}>
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!selectedTest) {
    return (
      <div className="App">
        <div className="container" id="main-content">
          <div className="app-header">
            <div className="header-content">
              <div className="header-text">
                <h1>AWS Practice Tests</h1>
                <p>Professional certification practice platform</p>
              </div>
              <div className="user-info">
                <span>Welcome, {user?.firstName || user?.email}</span>
                <button
                  className="theme-toggle-btn"
                  onClick={toggleTheme}
                  aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                  title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                >
                  {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
                </button>
                <button className="change-test-btn" onClick={() => navigate('/profile')}>
                  Profile
                </button>
                <button className="logout-btn" onClick={handleLogout}>
                  Logout
                </button>
              </div>
            </div>
          </div>
          
          {error && (
            <div className="error-banner">
              {error}
            </div>
          )}
          
          <TestSelector 
            tests={availableTests}
            selectedTest={selectedTest}
            onTestSelect={handleTestSelect}
            isLoading={isLoading}
          />
        </div>
      </div>
    );
  }

  const renderActiveTab = () => {
    if (isLoading) {
      return <div className="loading">Loading questions...</div>;
    }

    if (error && questions.length === 0) {
      return (
        <div className="error-message">
          <p>{error}</p>
          <button onClick={() => loadTestQuestions(selectedTest)}>
            Retry Loading Questions
          </button>
        </div>
      );
    }

    switch (activeTab) {
      case 'random':
        return <RandomPractice questions={questions} testName={selectedTest.name} testId={selectedTest.id} />;
      case 'mock':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <MockTest questions={questions} testName={selectedTest.name} testId={selectedTest.id} />
          </Suspense>
        );
      case 'fullmock':
        return (
          <div className="fullmock-launcher">
            <div className="fullmock-launcher-card">
              <div className="fullmock-launcher-icon"><Monitor size={48} /></div>
              <h2>Full Mock Exam</h2>
              <p>Simulates the real AWS certification exam experience in a dedicated fullscreen window.</p>
              <ul className="fullmock-features">
                <li>Pearson VUE-style interface</li>
                <li>{selectedTest.difficulty === 'Professional' ? '75' : '65'} questions, {selectedTest.timeLimit} minutes</li>
                <li>Passing score: {selectedTest.passingScore} / 1000</li>
                <li>NDA agreement, timed exam, review screen, scaled scoring</li>
              </ul>
              <button
                className="fullmock-launch-btn"
                onClick={() => window.open(`/full-mock/${selectedTest.id}`, '_blank')}
              >
                Launch Full Mock Exam →
              </button>
            </div>
          </div>
        );
      case 'practice':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <PracticeMode questions={questions} testName={selectedTest.name} testId={selectedTest.id} />
          </Suspense>
        );
      case 'study':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <StudyMode questions={questions} testName={selectedTest.name} testId={selectedTest.id} />
          </Suspense>
        );
      case 'spaced-repetition':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <SpacedRepetitionMode testName={selectedTest.name} testId={selectedTest.id} />
          </Suspense>
        );
      case 'history':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <TestHistory testName={selectedTest.name} testId={selectedTest.id} />
          </Suspense>
        );
      case 'bookmarks':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <BookmarkedQuestions testName={selectedTest.name} testId={selectedTest.id} />
          </Suspense>
        );
      case 'search':
        return (
          <Suspense fallback={<LoadingSpinner />}>
            <QuestionSearch testName={selectedTest.name} testId={selectedTest.id} />
          </Suspense>
        );
      default:
        return <RandomPractice questions={questions} testName={selectedTest.name} testId={selectedTest.id} />;
    }
  };

  return (
    <div className="App">
      <div className="container">
        <div className="app-header">
          <div className="header-content">
            <div className="header-text">
              <h1>{selectedTest.name}</h1>
              <p>{selectedTest.description}</p>
            </div>
            <div className="header-actions">
              <div className="user-info">
                <span>Welcome, {user?.firstName || user?.email}</span>
              </div>
              <button
                className="theme-toggle-btn"
                onClick={toggleTheme}
                aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
                title={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
              >
                {theme === 'light' ? <Moon size={18} /> : <Sun size={18} />}
              </button>
              <button 
                className="change-test-btn"
                onClick={handleChangeTest}
              >
                Change Test
              </button>
              <button className="change-test-btn" onClick={() => navigate('/profile')}>
                Profile
              </button>
              <button className="logout-btn" onClick={handleLogout}>
                Logout
              </button>
            </div>
          </div>
          
          <div className="test-info-bar">
            <span className="test-info-item">
              <BarChart3 size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> {questions.length} Questions Available
            </span>
            <span className="test-info-item">
              <Timer size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> {selectedTest.timeLimit} min Time Limit
            </span>
            <span className="test-info-item">
              <Target size={14} style={{verticalAlign: 'middle', marginRight: 4}} /> {selectedTest.passingScore}/1000 Passing Score
            </span>
          </div>
        </div>
        
        {error && questions.length > 0 && (
          <div className="warning-banner">
            {error}
          </div>
        )}
        
        <TabNavigation activeTab={activeTab} onTabChange={handleTabChange} />
        
        <main id="main-content" className="tab-content">
          {renderActiveTab()}
        </main>
      </div>
    </div>
  );
};

// Main App component with routing
function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AuthProvider>
          <Router>
            <SkipLink />
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route 
                path="/full-mock/:testId" 
                element={
                  <ProtectedRoute fallback={<Navigate to="/auth" replace />}>
                    <Suspense fallback={<LoadingSpinner />}>
                      <FullMockTest />
                    </Suspense>
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/profile" 
                element={
                  <ProtectedRoute fallback={<Navigate to="/auth" replace />}>
                    <Suspense fallback={<LoadingSpinner />}>
                      <UserProfile />
                    </Suspense>
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/*" 
                element={
                  <ProtectedRoute fallback={<Navigate to="/auth" replace />}>
                    <AppContent />
                  </ProtectedRoute>
                } 
              />
            </Routes>
          </Router>
        </AuthProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
