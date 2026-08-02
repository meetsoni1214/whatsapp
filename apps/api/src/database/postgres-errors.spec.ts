import { isUniqueConstraintViolation } from './postgres-errors';

describe('isUniqueConstraintViolation', () => {
  const usernameConstraint = 'users_username_unique';

  it('matches the requested unique constraint through wrapped errors', () => {
    const error = {
      cause: {
        code: '23505',
        constraint_name: usernameConstraint,
      },
    };

    expect(isUniqueConstraintViolation(error, usernameConstraint)).toBe(true);
  });

  it('does not match a different unique constraint', () => {
    const error = {
      code: '23505',
      constraint_name: 'auth_sessions_refresh_token_hash_unique',
    };

    expect(isUniqueConstraintViolation(error, usernameConstraint)).toBe(false);
  });

  it('requires PostgreSQL unique-violation code 23505', () => {
    const error = {
      code: '23503',
      constraint_name: usernameConstraint,
    };

    expect(isUniqueConstraintViolation(error, usernameConstraint)).toBe(false);
  });
});
