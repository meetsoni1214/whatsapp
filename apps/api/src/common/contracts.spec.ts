import { clientFrameSchema, registerInputSchema } from '@event-chat/contracts';

describe('shared runtime contracts', () => {
  it('normalizes valid registration input', () => {
    expect(
      registerInputSchema.parse({
        username: ' Alice_1 ',
        password: 'correct-horse-battery-staple',
      }),
    ).toEqual({
      username: 'alice_1',
      password: 'correct-horse-battery-staple',
    });
  });

  it('accepts a valid message command', () => {
    expect(
      clientFrameSchema.safeParse({
        v: 1,
        type: 'message.send',
        requestId: '426aa224-2ec1-4530-898c-d0c48f8b59c9',
        payload: {
          conversationId: '1685bc61-ac88-45e7-8437-593219fefb10',
          clientMessageId: 'af6ea967-9188-4a24-9908-81f8c0fc9443',
          content: 'Hello',
        },
      }).success,
    ).toBe(true);
  });

  it('rejects a message containing only whitespace', () => {
    expect(
      clientFrameSchema.safeParse({
        v: 1,
        type: 'message.send',
        requestId: '426aa224-2ec1-4530-898c-d0c48f8b59c9',
        payload: {
          conversationId: '1685bc61-ac88-45e7-8437-593219fefb10',
          clientMessageId: 'af6ea967-9188-4a24-9908-81f8c0fc9443',
          content: '   ',
        },
      }).success,
    ).toBe(false);
  });
});
