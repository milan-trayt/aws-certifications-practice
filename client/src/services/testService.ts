import { apiClient } from './api';
import { Question, TestMetadata } from '../types';

interface TestsResponse {
  tests: TestMetadata[];
  pagination: {
    currentPage: number;
    totalPages: number;
    totalTests: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface TestResponse {
  test: TestMetadata;
}

interface QuestionsResponse {
  test: {
    id: string;
    name: string;
    totalQuestions?: number;
  };
  questions: Question[];
  total_questions?: number;
  pagination?: {
    currentPage: number;
    totalPages: number;
    totalQuestions: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

interface QuestionResponse {
  question: Question;
  test: {
    id: string;
    name: string;
  };
}

export const testService = {
  /**
   * Get all available tests
   */
  async getTests(page = 1, limit = 10): Promise<TestsResponse> {
    const response = await apiClient.get<{ data: TestsResponse }>('/tests', {
      params: { page, limit },
    });
    return response.data.data;
  },

  /**
   * Get specific test metadata
   */
  async getTest(testId: string): Promise<TestResponse> {
    const response = await apiClient.get<{ data: TestResponse }>(`/tests/${testId}`);
    return response.data.data;
  },

  /**
   * Get questions for a specific test (paginated)
   */
  async getQuestions(
    testId: string,
    page = 1,
    limit = 50,
    shuffle = false
  ): Promise<QuestionsResponse> {
    const response = await apiClient.get<{ data: QuestionsResponse }>(
      `/tests/${testId}/questions`,
      {
        params: { page, limit, shuffle },
      }
    );
    return response.data.data;
  },

  /**
   * Get all questions for a test (for practice modes that need all questions)
   */
  async getAllQuestions(testId: string): Promise<QuestionsResponse> {
    const response = await apiClient.get<{ data: QuestionsResponse }>(
      `/tests/${testId}/questions/all`
    );
    return response.data.data;
  },

  /**
   * Get a specific question
   */
  async getQuestion(testId: string, questionId: string): Promise<QuestionResponse> {
    const response = await apiClient.get<{ data: QuestionResponse }>(
      `/tests/${testId}/questions/${questionId}`
    );
    return response.data.data;
  },

  /**
   * Shuffle array using Fisher-Yates algorithm (client-side)
   */
  shuffleQuestions<T>(array: T[]): T[] {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  },

  /**
   * Filter out questions with empty choices or missing content
   */
  filterValidQuestions(questions: Question[]): Question[] {
    return questions.filter(question => {
      const hasValidChoices = Object.values(question.choices).some(choice => 
        choice && choice.trim().length > 0
      );
      const hasValidQuestionText = question.question_text && question.question_text.trim().length > 0;
      const hasImagePlaceholder = question.question_text && question.question_text.includes('//IMG//');
      
      // Keep questions that have valid choices OR have image placeholders
      return hasValidQuestionText && (hasValidChoices || hasImagePlaceholder);
    });
  },

  /**
   * Cache management for offline support
   */
  cacheKey: (testId: string) => `test_${testId}_questions`,

  /**
   * Get cached questions (for offline support)
   */
  getCachedQuestions(testId: string): Question[] | null {
    try {
      const cached = localStorage.getItem(testService.cacheKey(testId));
      return cached ? JSON.parse(cached) : null;
    } catch (error) {
      console.error('Error reading cached questions:', error);
      return null;
    }
  },

  /**
   * Cache questions (for offline support)
   */
  cacheQuestions(testId: string, questions: Question[]): void {
    try {
      localStorage.setItem(testService.cacheKey(testId), JSON.stringify(questions));
    } catch (error) {
      console.error('Error caching questions:', error);
    }
  },

  /**
   * Clear cached questions
   */
  clearCache(testId?: string): void {
    if (testId) {
      localStorage.removeItem(testService.cacheKey(testId));
    } else {
      // Clear all test caches
      const keys = Object.keys(localStorage);
      keys.forEach(key => {
        if (key.startsWith('test_') && key.endsWith('_questions')) {
          localStorage.removeItem(key);
        }
      });
    }
  },
};