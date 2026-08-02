import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';
import { ZodValidationPipe } from './zod-validation.pipe';

describe('ZodValidationPipe', () => {
  const schema = z.object({
    username: z.string().trim().toLowerCase().min(3),
    page: z.coerce.number().int().positive(),
  });

  const pipe = new ZodValidationPipe(schema);

  it('returns parsed and transformed data', () => {
    expect(pipe.transform({ username: ' Alice ', page: '2' })).toEqual({
      username: 'alice',
      page: 2,
    });
  });

  it('rejects values that do not satisfy the schema', () => {
    expect(() =>
      pipe.transform({ username: 'a', page: 'not-a-number' }),
    ).toThrow(BadRequestException);
  });
});
