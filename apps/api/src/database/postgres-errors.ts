interface PostgreSqlError {
  cause?: unknown;
  code?: unknown;
  constraint?: unknown;
  constraint_name?: unknown;
}

export function isUniqueConstraintViolation(
  error: unknown,
  constraintName: string,
): boolean {
  const visited = new Set<object>();
  let current = error;

  while (isPostgreSqlError(current) && !visited.has(current)) {
    visited.add(current);

    const constraint = current.constraint_name ?? current.constraint;
    if (current.code === '23505' && constraint === constraintName) {
      return true;
    }

    current = current.cause;
  }

  return false;
}

function isPostgreSqlError(value: unknown): value is PostgreSqlError & object {
  return typeof value === 'object' && value !== null;
}
