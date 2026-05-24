import { BaseAgent } from '../../core/agent-base';
import { AgentMessage, StateOperation } from '../../core/message';
import { ContextManager } from '../../core/context';
import { GameState } from '../../state/types';
import { applyOperation } from '../../state/transitions';
import { createInitialState } from '../../state/initial';

interface StateEvent {
  event_id: string;
  version_before: number;
  version_after: number;
  timestamp: number;
  correlation_id: string;
  operations: StateOperation[];
}

export class StatusKeeperAgent extends BaseAgent {
  private state: GameState;
  private eventLog: StateEvent[] = [];

  constructor(context: ContextManager) {
    super('status_keeper', context);
    this.state = createInitialState();
  }

  async handleMessage(msg: AgentMessage): Promise<AgentMessage> {
    switch (msg.action) {
      case 'modify_state':
        return this.handleModifyState(msg);
      case 'query_state':
        return this.handleQueryState(msg);
      case 'rollback_state':
        return this.handleRollback(msg);
      default:
        return this.buildResponse(msg, {
          success: false,
          error: { code: 'UNSUPPORTED_ACTION', message: `StatusKeeper does not handle ${msg.action}` },
        });
    }
  }

  private handleModifyState(msg: AgentMessage): AgentMessage {
    const operations = (msg.payload as { operations: StateOperation[] }).operations;
    if (!operations || operations.length === 0) {
      return this.buildResponse(msg, { success: false, error: { code: 'NO_OPERATIONS', message: 'No operations provided' } });
    }

    const versionBefore = this.state.version;
    let newState = this.state;
    for (const op of operations) {
      newState = applyOperation(newState, op);
    }
    this.state = newState;

    this.eventLog.push({
      event_id: `evt_${Date.now()}`,
      version_before: versionBefore,
      version_after: this.state.version,
      timestamp: Date.now(),
      correlation_id: msg.correlation_id,
      operations,
    });

    const sideEffects: StateOperation[] = [];
    if (this.state.player.hp <= 0) {
      sideEffects.push({ field: 'game_status', op: 'set', value: 'defeated', reason: 'HP reached 0' });
      this.state = applyOperation(this.state, sideEffects[0]);
    } else if (this.state.player.marks.length >= 5) {
      sideEffects.push({ field: 'game_status', op: 'set', value: 'victory', reason: 'Collected 5 marks' });
      this.state = applyOperation(this.state, sideEffects[0]);
    }

    return this.buildResponse(msg, {
      success: true,
      data: { state: this.state, version: this.state.version },
      side_effects: sideEffects.length > 0 ? sideEffects : undefined,
    });
  }

  private handleQueryState(msg: AgentMessage): AgentMessage {
    return this.buildResponse(msg, {
      success: true,
      data: { state: this.state },
    });
  }

  private handleRollback(msg: AgentMessage): AgentMessage {
    const targetVersion = (msg.payload as { target_version: number }).target_version;
    if (targetVersion < 0 || targetVersion >= this.state.version) {
      return this.buildResponse(msg, { success: false, error: { code: 'INVALID_VERSION', message: 'Invalid target version' } });
    }

    let rebuilt = createInitialState();
    for (const event of this.eventLog) {
      if (event.version_after > targetVersion) break;
      for (const op of event.operations) {
        rebuilt = applyOperation(rebuilt, op);
      }
    }
    this.state = rebuilt;
    return this.buildResponse(msg, { success: true, data: { state: this.state } });
  }

  getState(): GameState {
    return this.state;
  }

  resetState(): void {
    this.state = createInitialState();
    this.eventLog = [];
  }
}
