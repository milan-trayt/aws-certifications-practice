const {
  generateTemporaryPassword,
  createCognitoUser,
} = require('./migrate-users-to-cognito');

// ---------------------------------------------------------------------------
// generateTemporaryPassword
// ---------------------------------------------------------------------------

describe('generateTemporaryPassword', () => {
  test('returns a 16-character string', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toHaveLength(16);
  });

  test('contains at least one uppercase letter', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/[A-Z]/);
  });

  test('contains at least one lowercase letter', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/[a-z]/);
  });

  test('contains at least one digit', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/[0-9]/);
  });

  test('contains at least one special character', () => {
    const pw = generateTemporaryPassword();
    expect(pw).toMatch(/[!@#$%^&*]/);
  });
});

// ---------------------------------------------------------------------------
// createCognitoUser
// ---------------------------------------------------------------------------

describe('createCognitoUser', () => {
  test('sends AdminCreateUserCommand and returns the sub', async () => {
    const mockSend = jest.fn().mockResolvedValue({
      User: {
        Attributes: [
          { Name: 'sub', Value: 'cognito-sub-123' },
          { Name: 'email', Value: 'test@example.com' },
        ],
      },
    });
    const mockClient = { send: mockSend };

    const sub = await createCognitoUser(mockClient, 'us-east-1_pool', 'test@example.com');

    expect(sub).toBe('cognito-sub-123');
    expect(mockSend).toHaveBeenCalledTimes(1);

    const command = mockSend.mock.calls[0][0];
    expect(command.input.UserPoolId).toBe('us-east-1_pool');
    expect(command.input.Username).toBe('test@example.com');
    expect(command.input.MessageAction).toBe('SUPPRESS');
    expect(command.input.UserAttributes).toEqual(
      expect.arrayContaining([
        { Name: 'email', Value: 'test@example.com' },
        { Name: 'email_verified', Value: 'true' },
      ])
    );
  });

  test('throws when Cognito response has no sub attribute', async () => {
    const mockSend = jest.fn().mockResolvedValue({
      User: { Attributes: [{ Name: 'email', Value: 'test@example.com' }] },
    });
    const mockClient = { send: mockSend };

    await expect(
      createCognitoUser(mockClient, 'pool-id', 'test@example.com')
    ).rejects.toThrow('Cognito response did not include a sub attribute');
  });

  test('propagates Cognito API errors', async () => {
    const mockSend = jest.fn().mockRejectedValue(new Error('UsernameExistsException'));
    const mockClient = { send: mockSend };

    await expect(
      createCognitoUser(mockClient, 'pool-id', 'dup@example.com')
    ).rejects.toThrow('UsernameExistsException');
  });
});
