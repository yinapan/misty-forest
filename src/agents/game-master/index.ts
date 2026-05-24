import { BaseAgent } from '../../core/agent-base';
import { AgentMessage, createMessage, ResponsePayload, StateOperation } from '../../core/message';
import { ContextManager } from '../../core/context';
import { MessageRouter, PlayerIntent } from '../../core/router';
import { StatusKeeperAgent } from '../status-keeper';
import { SCENES } from '../../data/scenes';
import { GAME } from '../../data/constants';

export class GameMasterAgent extends BaseAgent {
  private router: MessageRouter;
  private statusKeeper: StatusKeeperAgent;

  constructor(context: ContextManager, router: MessageRouter, statusKeeper: StatusKeeperAgent) {
    super('game_master', context);
    this.router = router;
    this.statusKeeper = statusKeeper;
  }

  async handleMessage(msg: AgentMessage): Promise<AgentMessage> {
    return this.buildResponse(msg, { success: true, display_text: '' });
  }

  parseIntent(input: string): PlayerIntent {
    const trimmed = input.trim().toLowerCase();
    if (/^(提示|hint)$/.test(trimmed)) return 'hint';
    if (/^(状态|status)$/.test(trimmed)) return 'status';
    if (/^(帮助|help|\?)$/.test(trimmed)) return 'help';
    if (/^(探索|look|查看|观察)$/.test(trimmed)) return 'explore';
    if (/^(放弃|skip|跳过)$/.test(trimmed)) return 'skip';
    if (/^(道具|item|使用|用)/.test(trimmed)) return 'use_item';
    if (trimmed.length === 0) return 'invalid';
    return 'answer';
  }

  async processPlayerInput(input: string): Promise<string> {
    const state = this.statusKeeper.getState();

    if (state.session.game_status !== 'active') {
      return '游戏已结束。输入"重新开始"开始新的冒险。';
    }

    // Increment turn count
    await this.router.routeMessage(createMessage(
      'game_master', 'status_keeper', 'modify_state',
      { operations: [{ field: 'turn_count', op: 'add', value: 1, reason: '新回合' }] },
      `turn_${Date.now()}`,
    ));

    const intent = this.parseIntent(input);
    let result: string;

    switch (intent) {
      case 'answer':
        result = await this.handleAnswer(input);
        break;
      case 'hint':
        result = await this.handleHint();
        break;
      case 'status':
        result = this.getStatusDisplay();
        break;
      case 'help':
        result = await this.handleHelp();
        break;
      case 'explore':
        result = await this.handleExplore();
        break;
      case 'skip':
        result = await this.handleSkip();
        break;
      case 'use_item':
        result = await this.handleUseItem(input);
        break;
      case 'invalid':
      default:
        result = await this.handleInvalid(input);
        break;
    }

    this.context.recordTurn(input, result);

    const updatedState = this.statusKeeper.getState();
    if (updatedState.session.game_status === 'defeated') {
      const ending = await this.router.routeMessage(createMessage(
        'game_master', 'narrator', 'render_ending',
        { ending_type: 'defeated', stats: { marks: updatedState.player.marks.length, attempts: updatedState.player.total_attempts, hp: 0 } },
      ));
      const endPayload = ending.payload as unknown as ResponsePayload;
      result += '\n\n' + (endPayload.display_text ?? '');
    } else if (updatedState.session.game_status === 'victory') {
      const endingType = updatedState.player.hp === updatedState.player.max_hp ? 'perfect' : 'victory';
      const ending = await this.router.routeMessage(createMessage(
        'game_master', 'narrator', 'render_ending',
        { ending_type: endingType, stats: { marks: 5, attempts: updatedState.player.total_attempts, hp: updatedState.player.hp } },
      ));
      const endPayload = ending.payload as unknown as ResponsePayload;
      result += '\n\n' + (endPayload.display_text ?? '');
    }

    return result;
  }

  async startGame(): Promise<string> {
    this.statusKeeper.resetState();
    this.context.reset();

    const tutorialMsg = createMessage('game_master', 'guide', 'show_tutorial', {});
    const tutorialResp = await this.router.routeMessage(tutorialMsg);
    const tutorialText = (tutorialResp.payload as unknown as ResponsePayload).display_text ?? '';

    const sceneText = await this.enterNewScene();
    return tutorialText + '\n' + sceneText;
  }

  async enterNewScene(): Promise<string> {
    const state = this.statusKeeper.getState();
    const completed = state.session.scenes_completed;
    const available = SCENES.filter(s => !completed.includes(s.id));

    if (available.length === 0) {
      return '所有场景已完成！';
    }

    // Weighted random: failed scenes have higher weight
    const failed = state.session.scenes_failed;
    const weighted = available.flatMap(s => failed.includes(s.id) ? [s, s, s] : [s]);
    const selected = weighted[Math.floor(Math.random() * weighted.length)];

    this.context.setCurrentScene(selected.id);
    const entryCount = this.context.getSceneEntryCount(selected.id);

    // Update state
    await this.router.routeMessage(createMessage(
      'game_master', 'status_keeper', 'modify_state',
      { operations: [
        { field: 'current_scene', op: 'set', value: selected.id, reason: '进入新场景' },
        { field: 'current_attempt', op: 'set', value: 0, reason: '重置' },
        { field: 'hints_used_current', op: 'set', value: 0, reason: '重置' },
      ] as StateOperation[] },
    ));

    // Remove from failed if re-entering
    if (failed.includes(selected.id)) {
      await this.router.routeMessage(createMessage(
        'game_master', 'status_keeper', 'modify_state',
        { operations: [{ field: 'scenes_failed', op: 'remove', value: selected.id, reason: '重新挑战' }] },
      ));
    }

    // Render scene
    const sceneResp = await this.router.routeMessage(createMessage(
      'game_master', 'narrator', 'render_scene',
      { scene_id: selected.id, trigger: 'enter', player_context: { hp: state.player.hp, marks_collected: completed } },
    ));
    const sceneText = ((sceneResp.payload as unknown as ResponsePayload).display_text) ?? '';

    // Generate puzzle
    const puzzleResp = await this.router.routeMessage(createMessage(
      'game_master', 'puzzle_master', 'generate_puzzle',
      { scene_id: selected.id, variant_index: entryCount - 1 },
    ));
    const puzzlePayload = puzzleResp.payload as unknown as ResponsePayload;
    const puzzleText = puzzlePayload.display_text ?? '';

    if (puzzlePayload.data?.puzzle_id) {
      await this.router.routeMessage(createMessage(
        'game_master', 'status_keeper', 'modify_state',
        { operations: [{ field: 'current_puzzle_id', op: 'set', value: puzzlePayload.data.puzzle_id, reason: '新谜题' }] },
      ));
    }

    return sceneText + '\n' + puzzleText;
  }

  private async handleAnswer(input: string): Promise<string> {
    const state = this.statusKeeper.getState();
    if (!state.session.current_scene || !state.session.current_puzzle_id) {
      return '当前没有活跃的谜题。';
    }

    const resp = await this.router.routeMessage(createMessage(
      'game_master', 'puzzle_master', 'validate_answer',
      {
        scene_id: state.session.current_scene,
        puzzle_id: state.session.current_puzzle_id,
        player_answer: input,
        attempt_number: state.session.current_attempt + 1,
        hints_used: state.session.hints_used_current,
      },
    ));

    const payload = resp.payload as unknown as ResponsePayload;
    await this.applySideEffects(payload.side_effects, resp.correlation_id);

    let result = payload.display_text ?? '';

    // Track total attempts
    await this.router.routeMessage(createMessage(
      'game_master', 'status_keeper', 'modify_state',
      { operations: [{ field: 'total_attempts', op: 'add', value: 1, reason: '答题' }] },
    ));

    if (payload.data?.correct || payload.data?.failed_out || payload.data?.skipped) {
      const updatedState = this.statusKeeper.getState();
      if (updatedState.session.game_status === 'active') {
        const nextScene = await this.enterNewScene();
        result += '\n\n' + nextScene;
      }
    }

    return result;
  }

  private async handleHint(): Promise<string> {
    const state = this.statusKeeper.getState();
    if (!state.session.current_scene || !state.session.current_puzzle_id) {
      return '当前没有活跃的谜题，无法请求提示。';
    }

    // Check for free hint item
    const hasLantern = state.player.items.some(i => i.name === '迷雾灯笼');
    if (hasLantern) {
      await this.router.routeMessage(createMessage(
        'game_master', 'status_keeper', 'modify_state',
        { operations: [{ field: 'items', op: 'remove', value: '迷雾灯笼', reason: '使用迷雾灯笼免费提示' }] },
      ));
    }

    const resp = await this.router.routeMessage(createMessage(
      'game_master', 'puzzle_master', 'request_hint',
      { scene_id: state.session.current_scene, puzzle_id: state.session.current_puzzle_id, current_hint_level: state.session.hints_used_current },
    ));

    const payload = resp.payload as unknown as ResponsePayload;

    if (!hasLantern) {
      await this.applySideEffects(payload.side_effects, resp.correlation_id);
    } else {
      // Still track hints_used but don't deduct HP
      await this.router.routeMessage(createMessage(
        'game_master', 'status_keeper', 'modify_state',
        { operations: [{ field: 'hints_used_current', op: 'add', value: 1, reason: '使用免费提示' }] },
      ));
    }

    let text = payload.display_text ?? '';
    if (hasLantern) {
      text = '🔦 迷雾灯笼发出光芒，免费获得提示！\n' + text;
    }

    return text;
  }

  private getStatusDisplay(): string {
    const state = this.statusKeeper.getState();
    const marks = state.player.marks.map(m => m.scene_id).join(', ') || '无';
    const items = state.player.items.map(i => i.name).join(', ') || '无';
    const sceneName = state.session.current_scene
      ? (SCENES.find(s => s.id === state.session.current_scene)?.name ?? state.session.current_scene)
      : '无';

    return `
📊 当前状态：
❤️  HP: ${state.player.hp}/${state.player.max_hp}
🔮 印记: ${state.player.marks.length}/5 [${marks}]
🎒 道具: ${items}
📍 当前场景: ${sceneName}
🔢 当前尝试: ${state.session.current_attempt}/${GAME.MAX_ATTEMPTS_PER_PUZZLE}
💡 已用提示: ${state.session.hints_used_current}/${GAME.MAX_HINTS_PER_PUZZLE}
🏆 连续正确: ${state.player.consecutive_correct}
`.trim();
  }

  private async handleHelp(): Promise<string> {
    const resp = await this.router.routeMessage(createMessage('game_master', 'guide', 'show_help', {}));
    return (resp.payload as unknown as ResponsePayload).display_text ?? '';
  }

  private async handleExplore(): Promise<string> {
    const state = this.statusKeeper.getState();
    if (!state.session.current_scene) return '你还没有进入任何场景。';

    const resp = await this.router.routeMessage(createMessage(
      'game_master', 'narrator', 'render_scene',
      { scene_id: state.session.current_scene, trigger: 'explore', player_context: { hp: state.player.hp, marks_collected: state.session.scenes_completed } },
    ));
    return (resp.payload as unknown as ResponsePayload).display_text ?? '';
  }

  private async handleSkip(): Promise<string> {
    const state = this.statusKeeper.getState();
    if (!state.session.current_scene) return '当前没有可跳过的谜题。';

    const resp = await this.router.routeMessage(createMessage(
      'game_master', 'puzzle_master', 'validate_answer',
      { scene_id: state.session.current_scene, puzzle_id: state.session.current_puzzle_id, player_answer: '', attempt_number: 0, hints_used: 0, force_skip: true },
    ));

    const payload = resp.payload as unknown as ResponsePayload;
    await this.applySideEffects(payload.side_effects, resp.correlation_id);

    let result = payload.display_text ?? '';
    const updatedState = this.statusKeeper.getState();
    if (updatedState.session.game_status === 'active') {
      const nextScene = await this.enterNewScene();
      result += '\n\n' + nextScene;
    }

    return result;
  }

  private async handleUseItem(input: string): Promise<string> {
    const state = this.statusKeeper.getState();
    const itemNames = state.player.items.map(i => i.name);

    if (itemNames.length === 0) return '你没有任何道具可以使用。';

    const targetItem = itemNames.find(name => input.includes(name));
    if (!targetItem) {
      return `可用道具：${itemNames.join('、')}\n输入"使用 [道具名]"来使用。`;
    }

    const ops: StateOperation[] = [{ field: 'items', op: 'remove', value: targetItem, reason: '玩家使用' }];
    if (targetItem === '生命露珠') {
      ops.push({ field: 'hp', op: 'add', value: 20, reason: '使用生命露珠' });
    }

    await this.router.routeMessage(createMessage(
      'game_master', 'status_keeper', 'modify_state', { operations: ops },
    ));

    if (targetItem === '生命露珠') return '💧 使用了生命露珠，恢复 20 HP！';
    if (targetItem === '迷雾灯笼') return '🔦 迷雾灯笼已激活，下次请求提示将免费！';
    if (targetItem === '时间沙漏') return '⏳ 时间沙漏已使用，额外获得一次答题机会！';
    return `已使用 ${targetItem}。`;
  }

  private async handleInvalid(input: string): Promise<string> {
    const resp = await this.router.routeMessage(createMessage(
      'game_master', 'guide', 'handle_invalid', { player_input: input },
    ));
    return (resp.payload as unknown as ResponsePayload).display_text ?? '';
  }

  private async applySideEffects(effects: StateOperation[] | undefined, correlationId: string): Promise<void> {
    if (!effects || effects.length === 0) return;
    await this.router.routeMessage(createMessage(
      'game_master', 'status_keeper', 'modify_state',
      { operations: effects }, correlationId,
    ));
  }
}
