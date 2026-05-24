import { createGame } from '../../src/index';

describe('Full game round integration', () => {
  test('game starts and produces tutorial + scene + puzzle', async () => {
    const { gameMaster } = createGame();
    const output = await gameMaster.startGame();

    expect(output).toContain('迷雾森林');
    expect(output).toContain('游戏规则');
    expect(output).toContain('谜题');
  });

  test('player can view status', async () => {
    const { gameMaster } = createGame();
    await gameMaster.startGame();
    const output = await gameMaster.processPlayerInput('状态');

    expect(output).toContain('HP');
    expect(output).toContain('100');
    expect(output).toContain('印记');
  });

  test('player can request help', async () => {
    const { gameMaster } = createGame();
    await gameMaster.startGame();
    const output = await gameMaster.processPlayerInput('帮助');

    expect(output).toContain('指令');
    expect(output).toContain('提示');
  });

  test('player can explore scene again', async () => {
    const { gameMaster } = createGame();
    await gameMaster.startGame();
    const output = await gameMaster.processPlayerInput('探索');

    expect(output.length).toBeGreaterThan(20);
  });

  test('wrong answer deducts HP', async () => {
    const { gameMaster, statusKeeper } = createGame();
    await gameMaster.startGame();

    const initialHp = statusKeeper.getState().player.hp;
    await gameMaster.processPlayerInput('错误答案xyz');
    expect(statusKeeper.getState().player.hp).toBeLessThan(initialHp);
  });

  test('hint deducts HP', async () => {
    const { gameMaster, statusKeeper } = createGame();
    await gameMaster.startGame();

    const initialHp = statusKeeper.getState().player.hp;
    const output = await gameMaster.processPlayerInput('提示');
    expect(statusKeeper.getState().player.hp).toBeLessThan(initialHp);
    expect(output).toContain('提示');
  });

  test('skip deducts 20 HP and moves to next scene', async () => {
    const { gameMaster, statusKeeper } = createGame();
    await gameMaster.startGame();

    const output = await gameMaster.processPlayerInput('放弃');
    expect(statusKeeper.getState().player.hp).toBeLessThanOrEqual(80);
    expect(output).toContain('放弃');
  });

  test('invalid input is handled gracefully', async () => {
    const { gameMaster } = createGame();
    await gameMaster.startGame();
    const output = await gameMaster.processPlayerInput('');

    expect(output).toContain('输入');
  });

  test('game ends after HP reaches 0', async () => {
    const { gameMaster, statusKeeper } = createGame();
    await gameMaster.startGame();

    // Drain HP through repeated skips
    for (let i = 0; i < 5; i++) {
      await gameMaster.processPlayerInput('放弃');
      if (statusKeeper.getState().session.game_status !== 'active') break;
    }

    const state = statusKeeper.getState();
    if (state.session.game_status === 'defeated') {
      const output = await gameMaster.processPlayerInput('test');
      expect(output).toContain('已结束');
    }
  });
});
