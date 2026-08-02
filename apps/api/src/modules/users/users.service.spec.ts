import { UnauthorizedException } from '@nestjs/common';
import type { PublicUser } from '@event-chat/contracts';
import { UsersRepository } from './users.repository';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let repository: {
    findPublicById: jest.MockedFunction<UsersRepository['findPublicById']>;
    searchByUsernamePrefix: jest.MockedFunction<
      UsersRepository['searchByUsernamePrefix']
    >;
  };
  let service: UsersService;

  beforeEach(() => {
    repository = {
      findPublicById: jest.fn(),
      searchByUsernamePrefix: jest.fn(),
    };
    service = new UsersService(repository as unknown as UsersRepository);
  });

  it('returns the authenticated public user', async () => {
    const user: PublicUser = {
      id: '426aa224-2ec1-4530-898c-d0c48f8b59c9',
      username: 'alice',
    };
    repository.findPublicById.mockResolvedValue(user);

    await expect(service.findMe(user.id)).resolves.toEqual(user);
  });

  it('rejects an authenticated user that no longer exists', async () => {
    repository.findPublicById.mockResolvedValue(undefined);

    await expect(
      service.findMe('426aa224-2ec1-4530-898c-d0c48f8b59c9'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('delegates normalized search parameters to the repository', async () => {
    const users: PublicUser[] = [
      {
        id: '1685bc61-ac88-45e7-8437-593219fefb10',
        username: 'bob',
      },
    ];
    repository.searchByUsernamePrefix.mockResolvedValue(users);

    await expect(
      service.search('426aa224-2ec1-4530-898c-d0c48f8b59c9', {
        q: 'bo',
        limit: 20,
      }),
    ).resolves.toEqual(users);
    expect(repository.searchByUsernamePrefix).toHaveBeenCalledWith(
      '426aa224-2ec1-4530-898c-d0c48f8b59c9',
      'bo',
      20,
    );
  });
});
