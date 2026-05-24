import { createMessage, createResponse, AgentMessage } from '../../src/core/message';
import { MessageRouter, PlayerIntent } from '../../src/core/router';
import { ContextManager } from '../../src/core/context';
import { BaseAgent } from '../../src/core/agent-base';

class MockAgent extends BaseAgent {
  public lastMessage: AgentMessage | null = null;

  constructor(context: ContextManager, role: 'narrator' | 'puzzle_master' | 'status_keeper' | 'guide') {
    super(role, context);
  }

  async handleMessage(msg: AgentMessage): Promise<AgentMessage> {
    this.lastMessage = msg;
    return this.buildResponse(msg, { success: true, display_text: `Mock ${this.role} response` });
  }
}

describe('MessageRouter', () => {
  let router: MessageRouter;
  let context: ContextManager;

  beforeEach(() => {
    router = new MessageRouter();
    context = new ContextManager();
  });

  test('routes messages to registered agents', async () => {
    const narrator = new MockAgent(context, 'narrator');
    router.registerAgent(narrator);

    const msg = createMessage('game_master', 'narrator', 'render_scene', { scene_id: 'S1' });
    const resp = await router.routeMessage(msg);

    expect(narrator.lastMessage).toBe(msg);
    expect((resp.payload as any).success).toBe(true);
  });

  test('returns error for unregistered agents', async () => {
    const msg = createMessage('game_master', 'narrator', 'render_scene', {});
    const resp = await router.routeMessage(msg);

    expect((resp.payload as any).success).toBe(false);
    expect((resp.payload as any).error.code).toBe('AGENT_NOT_FOUND');
  });

  test('deduplicates messages by msg_id', async () => {
    const narrator = new MockAgent(context, 'narrator');
    router.registerAgent(narrator);

    const msg = createMessage('game_master', 'narrator', 'render_scene', {});
    await router.routeMessage(msg);
    const resp2 = await router.routeMessage(msg);

    expect((resp2.payload as any).display_text).toBe('（消息已处理）');
  });

  test('getRouteForIntent returns correct route', () => {
    const intents: [PlayerIntent, string][] = [
      ['answer', 'puzzle_master'],
      ['hint', 'puzzle_master'],
      ['status', 'status_keeper'],
      ['help', 'guide'],
      ['explore', 'narrator'],
      ['skip', 'puzzle_master'],
      ['invalid', 'guide'],
    ];

    for (const [intent, target] of intents) {
      const rule = router.getRouteForIntent(intent);
      expect(rule?.target).toBe(target);
    }
  });
});

describe('createMessage', () => {
  test('creates valid message structure', () => {
    const msg = createMessage('game_master', 'narrator', 'render_scene', { scene_id: 'S1' });

    expect(msg.sender).toBe('game_master');
    expect(msg.receiver).toBe('narrator');
    expect(msg.action).toBe('render_scene');
    expect(msg.payload).toEqual({ scene_id: 'S1' });
    expect(msg.priority).toBe('normal');
    expect(msg.msg_id).toBeDefined();
    expect(msg.correlation_id).toBeDefined();
    expect(msg.timestamp).toBeGreaterThan(0);
  });

  test('createResponse links to original message', () => {
    const original = createMessage('game_master', 'narrator', 'render_scene', {});
    const response = createResponse(original, 'narrator', { success: true, display_text: 'test' });

    expect(response.reply_to).toBe(original.msg_id);
    expect(response.correlation_id).toBe(original.correlation_id);
    expect(response.sequence).toBe(original.sequence + 1);
    expect(response.sender).toBe('narrator');
    expect(response.receiver).toBe('game_master');
  });
});
