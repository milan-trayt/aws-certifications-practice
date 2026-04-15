import { apiClient } from './api';

export interface Bookmark {
  id: number;
  questionId: string;
  questionText: string;
  testId: string;
  questionNumber: number;
  choices: Record<string, string>;
  correctAnswer: string;
  isMultipleChoice: boolean;
  discussion?: any;
  discussionCount?: number;
  questionImages?: string[];
  answerImages?: string[];
  createdAt: string;
}

interface BookmarkResponse {
  id: number;
  questionId: string;
  createdAt: string;
}

interface ApiResponse<T> {
  data: T;
  meta: { requestId?: string };
}

export const bookmarkService = {
  async getBookmarks(testId?: string): Promise<Bookmark[]> {
    const params: Record<string, string> = {};
    if (testId) params.testId = testId;
    const response = await apiClient.get<ApiResponse<Bookmark[]>>('/bookmarks', { params });
    return response.data.data;
  },

  async addBookmark(questionId: string): Promise<BookmarkResponse> {
    const response = await apiClient.post<ApiResponse<BookmarkResponse>>('/bookmarks', { questionId });
    return response.data.data;
  },

  async removeBookmark(questionId: string): Promise<void> {
    await apiClient.delete(`/bookmarks/${questionId}`);
  },
};
