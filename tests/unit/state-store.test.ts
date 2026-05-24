import { ContextManager } from '../../src/core/context';
import { StatusKeeperAgent } from '../../src/agents/status-keeper';
import { createMessage } from '../../src/core/message';

describe('StatusKeeperAgent', () => {
  let agent: StatusKeeperAgent;
  let context: ContextManager;

  beforeEach(() => {
    context = new ContextManager();
    agent = new StatusKeeperAgent(context);
  });

  test('initial state is correct', () => {
    const state = agent.getState();
    expect(state.player.hp).toBe(100);
    expect(state.player.max_hp).toBe(100);
    expect(state.player.marks).toEqual([]);
    expect(state.player.items).toEqual([]);
    expect(state.session.game_status).toBe('active');
    expect(state.version).toBe(0);
  });

  test('handles HP modification', async () => {
    const msg = createMessage('game_master', 'status_keeper', 'modify_state', {
      operations: [{ field: 'hp', op: 'subtract', value: 10, reason: 'test' }],
    });
    const resp = await agent.handleMessage(msg);
    expect((resp.payload as any).success).toBe(true);
    expect(agent.getState().player.hp).toBe(90);
  });

  test('HP cannot exceed max_hp', async () => {
    const msg = createMessage('game_master', 'status_keeper', 'modify_state', {
      operations: [{ field: 'hp', op: 'add', value: 50, reason: 'test' }],
    });
    await agent.handleMessage(msg);
    expect(agent.getState().player.hp).toBe(100);
  });

  test('HP cannot go below 0', async () => {
    const msg = createMessage('game_master', 'status_keeper', 'modify_state', {
      operations: [{ field: 'hp', op: 'subtract', value: 150, reason: 'test' }],
    });
    await agent.handleMessage(msg);
    expect(agent.getState().player.hp).toBe(0);
  });

  test('triggers game_over when HP reaches 0', async () => {
    const msg = createMessage('game_master', 'status_keeper', 'modify_state', {
      operations: [{ field: 'hp', op: 'subtract', value: 100, reason: 'test' }],
    });
    const resp = await agent.handleMessage(msg);
    expect(agent.getState().session.game_status).toBe('defeated');
    expect((resp.payload as any).side_effects).toBeDefined();
  });

  test('adds marks without duplicates', async () => {
    const msg1 = createMessage('game_master', 'status_keeper', 'modify_state', {
      operations: [{ field: 'marks', op: 'push', value: 'S1', reason: 'test' }],
    });
    await agent.handleMessage(msg1);
    expect(agent.getState().player.marks.length).toBe(1);

    // Duplicate
    const msg2 = createMessage('game_master', 'status_keeper', 'modify_state', {
      operations: [{ field: 'marks', op: 'push', value: 'S1', reason: 'test' }],
    });
    await agent.handleMessage(msg2);
    expect(agent.getState().player.marks.length).toBe(1);
  });

  test('triggers victory when 5 marks collected', async () => {
    for (const id of ['S1', 'S2', 'S3', 'S4', 'S5']) {
      await agent.handleMessage(createMessage('game_master', 'status_keeper', 'modify_state', {
        operations: [{ field: 'marks', op: 'push', value: id, reason: 'test' }],
      }));
    }
    expect(agent.getState().session.game_status).toBe('victory');
  });

  test('items capped at 3', async () => {
    for (let i = 0; i < 5; i++) {
      await agent.handleMessage(createMessage('game_master', 'status_keeper', 'modify_state', {
        operations: [{ field: 'items', op: 'push', value: '生命露珠', reason: 'test' }],
      }));
    }
    expect(agent.getState().player.items.length).toBe(3);
  });

  test('query_state returns current state', async () => {
    const msg = createMessage('game_master', 'status_keeper', 'query_state', {});
    const resp = await agent.handleMessage(msg);
    expect((resp.payload as any).success).toBe(true);
    expect((resp.payload as any).data.state).toBeDefined();
  });

  test('resetState clears everything', () => {
    agent.resetState();
    const state = agent.getState();
    expect(state.version).toBe(0);
    expect(state.player.hp).toBe(100);
  });
});
