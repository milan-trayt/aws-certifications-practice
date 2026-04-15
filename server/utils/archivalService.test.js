const { archiveOldResults, getArchivedResults } = require('./archivalService');

describe('archivalService', () => {
  // --- archiveOldResults ---
  describe('archiveOldResults', () => {
    test('archives results and returns count', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // INSERT answers
          .mockResolvedValueOnce({ rows: [{ id: 1 }, { id: 2 }] }) // INSERT results RETURNING
          .mockResolvedValueOnce(undefined) // DELETE answers
          .mockResolvedValueOnce(undefined) // DELETE results
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };
      const db = { connect: jest.fn().mockResolvedValue(mockClient) };

      const result = await archiveOldResults(db, 12);

      expect(result).toEqual({ archivedCount: 2 });
      expect(mockClient.query).toHaveBeenCalledTimes(6);
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('returns zero when nothing to archive', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // INSERT answers
          .mockResolvedValueOnce({ rows: [] }) // INSERT results RETURNING (none)
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };
      const db = { connect: jest.fn().mockResolvedValue(mockClient) };

      const result = await archiveOldResults(db, 12);

      expect(result).toEqual({ archivedCount: 0 });
      // Should not call DELETE when nothing archived
      expect(mockClient.query).toHaveBeenCalledTimes(4);
    });

    test('rolls back on error', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockRejectedValueOnce(new Error('DB failure')), // INSERT answers fails
        release: jest.fn(),
      };
      const db = { connect: jest.fn().mockResolvedValue(mockClient) };

      await expect(archiveOldResults(db, 12)).rejects.toThrow('DB failure');
      // ROLLBACK should have been called
      expect(mockClient.query).toHaveBeenCalledWith('ROLLBACK');
      expect(mockClient.release).toHaveBeenCalled();
    });

    test('uses provided olderThanMonths parameter', async () => {
      const mockClient = {
        query: jest.fn()
          .mockResolvedValueOnce(undefined) // BEGIN
          .mockResolvedValueOnce(undefined) // INSERT answers
          .mockResolvedValueOnce({ rows: [] }) // INSERT results
          .mockResolvedValueOnce(undefined), // COMMIT
        release: jest.fn(),
      };
      const db = { connect: jest.fn().mockResolvedValue(mockClient) };

      await archiveOldResults(db, 6);

      // The second call (INSERT answers) should use 6 as the parameter
      expect(mockClient.query.mock.calls[1][1]).toEqual([6]);
    });
  });

  // --- getArchivedResults ---
  describe('getArchivedResults', () => {
    test('returns paginated archived results', async () => {
      const db = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ count: '3' }] }) // COUNT
          .mockResolvedValueOnce({
            rows: [
              {
                id: 1, user_id: 42, test_id: 'aws-saa', score: 50,
                total_questions: 65, time_spent: 3600,
                completed_at: '2024-01-01T00:00:00Z',
                archived_at: '2025-01-15T00:00:00Z',
              },
            ],
          }),
      };

      const data = await getArchivedResults(db, 42, 1, 10);

      expect(data.results).toHaveLength(1);
      expect(data.results[0].testId).toBe('aws-saa');
      expect(data.results[0].percentage).toBe(77); // Math.round(50/65*100)
      expect(data.pagination.totalResults).toBe(3);
      expect(data.pagination.currentPage).toBe(1);
      expect(data.pagination.hasNextPage).toBe(false);
    });

    test('returns empty results when none exist', async () => {
      const db = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ count: '0' }] })
          .mockResolvedValueOnce({ rows: [] }),
      };

      const data = await getArchivedResults(db, 42, 1, 10);

      expect(data.results).toHaveLength(0);
      expect(data.pagination.totalResults).toBe(0);
      expect(data.pagination.totalPages).toBe(1);
    });

    test('calculates pagination correctly for multiple pages', async () => {
      const db = {
        query: jest.fn()
          .mockResolvedValueOnce({ rows: [{ count: '25' }] })
          .mockResolvedValueOnce({ rows: [] }),
      };

      const data = await getArchivedResults(db, 42, 2, 10);

      expect(data.pagination.totalPages).toBe(3);
      expect(data.pagination.currentPage).toBe(2);
      expect(data.pagination.hasNextPage).toBe(true);
      expect(data.pagination.hasPrevPage).toBe(true);
    });
  });
});
