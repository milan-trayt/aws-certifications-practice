import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import QuestionSearch from './QuestionSearch';

// --- Mocks ---

const mockGet = jest.fn();

jest.mock('../services/api', () => ({
  apiClient: {
    get: (...args: any[]) => mockGet(...args),
  },
  handleApiError: (err: any) =>
    err?.response?.data?.error || 'An unexpected error occurred.',
}));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
});

afterEach(() => {
  jest.useRealTimers();
});

const testProps = { testId: 'aws-saa', testName: 'AWS SAA-C03' };

// --- Tests ---

describe('QuestionSearch', () => {
  it('renders the search input and header', () => {
    render(<QuestionSearch {...testProps} />);
    expect(screen.getByPlaceholderText('Search questions by keyword…')).toBeInTheDocument();
    expect(screen.getByText(/Search Questions/i)).toBeInTheDocument();
  });

  it('displays search results with highlighted text', async () => {
    mockGet.mockResolvedValue({
      data: {
        questions: [
          {
            question_id: 'q1',
            question_number: 5,
            question_text: 'What is Amazon S3 used for?',
            choices: {},
            correct_answer: 'A',
            is_multiple_choice: false,
          },
        ],
        totalResults: 1,
        searchQuery: 'S3',
      },
    });

    render(<QuestionSearch {...testProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search questions by keyword…'), {
      target: { value: 'S3' },
    });

    // Advance past debounce
    act(() => { jest.advanceTimersByTime(400); });

    await waitFor(() => {
      expect(screen.getByText('1 question found')).toBeInTheDocument();
    });

    expect(screen.getByText('Q5')).toBeInTheDocument();
    // The highlighted "S3" should be in a <mark> element
    const marks = document.querySelectorAll('mark.search-highlight');
    expect(marks.length).toBeGreaterThan(0);
    expect(marks[0].textContent).toBe('S3');
  });

  it('shows "No results found" when search returns empty', async () => {
    mockGet.mockResolvedValue({
      data: {
        questions: [],
        totalResults: 0,
        searchQuery: 'nonexistent',
      },
    });

    render(<QuestionSearch {...testProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search questions by keyword…'), {
      target: { value: 'nonexistent' },
    });

    act(() => { jest.advanceTimersByTime(400); });

    await waitFor(() => {
      expect(screen.getByText('No results found')).toBeInTheDocument();
    });
  });

  it('shows error message on API failure', async () => {
    mockGet.mockRejectedValue({
      response: { data: { error: 'Server error' } },
    });

    render(<QuestionSearch {...testProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search questions by keyword…'), {
      target: { value: 'test' },
    });

    act(() => { jest.advanceTimersByTime(400); });

    await waitFor(() => {
      expect(screen.getByText('Server error')).toBeInTheDocument();
    });
  });

  it('clears results when clear button is clicked', async () => {
    mockGet.mockResolvedValue({
      data: {
        questions: [
          {
            question_id: 'q1',
            question_number: 1,
            question_text: 'Test question',
            choices: {},
            correct_answer: 'A',
            is_multiple_choice: false,
          },
        ],
        totalResults: 1,
        searchQuery: 'test',
      },
    });

    render(<QuestionSearch {...testProps} />);

    const input = screen.getByPlaceholderText('Search questions by keyword…');
    fireEvent.change(input, { target: { value: 'test' } });

    act(() => { jest.advanceTimersByTime(400); });

    await waitFor(() => {
      expect(screen.getByText('1 question found')).toBeInTheDocument();
    });

    // Click clear
    fireEvent.click(screen.getByLabelText('Clear search'));

    expect(input).toHaveValue('');
    expect(screen.queryByText('1 question found')).not.toBeInTheDocument();
  });

  it('debounces the search — does not call API immediately', () => {
    render(<QuestionSearch {...testProps} />);

    fireEvent.change(screen.getByPlaceholderText('Search questions by keyword…'), {
      target: { value: 'hello' },
    });

    // Before debounce fires
    expect(mockGet).not.toHaveBeenCalled();

    act(() => { jest.advanceTimersByTime(400); });

    expect(mockGet).toHaveBeenCalledTimes(1);
    expect(mockGet).toHaveBeenCalledWith(
      '/tests/aws-saa/questions/search',
      { params: { q: 'hello' } }
    );
  });
});
