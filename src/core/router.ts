import { AgentMessage, AgentRole, ActionType, createMessage } from './message';
import { BaseAgent } from './agent-base';

export type PlayerIntent = 'answer' | 'hint' | 'status' | 'use_item' | 'help' | 'explore' | 'skip' | 'invalid';

interface RouteRule {
  intent: PlayerIntent;
  target: AgentRole;
  action: ActionType;
}

const ROUTE_TABLE: RouteRule[] = [
  { intent: 'answer', target: 'puzzle_master', action: 'validate_answer' },
  { intent: 'hint', target: 'puzzle_master', action: 'request_hint' },
  { intent: 'status', target: 'status_keeper', action: 'query_state' },
  { intent: 'use_item', target: 'status_keeper', action: 'modify_state' },
  { intent: 'help', target: 'guide', action: 'show_help' },
  { intent: 'explore', target: 'narrator', action: 'render_scene' },
  { intent: 'skip', target: 'puzzle_master', action: 'validate_answer' },
  { intent: 'invalid', target: 'guide', action: 'handle_invalid' },
];

export class MessageRouter {
  private agents: Map<AgentRole, BaseAgent> = new Map();
  private processedMsgIds: Set<string> = new Set();
  private static readonly TIMEOUT_MS = 10000;

  registerAgent(agent: BaseAgent): void {
    this.agents.set(agent.getRole(), agent);
  }

  getRouteForIntent(intent: PlayerIntent): RouteRule | undefined {
    return ROUTE_TABLE.find(rule => rule.intent === intent);
  }

  async routeMessage(msg: AgentMessage): Promise<AgentMessage> {
    if (this.processedMsgIds.has(msg.msg_id)) {
      return createMessage(msg.receiver, msg.sender, 'response', {
        success: true,
        display_text: '（消息已处理）',
      }, msg.correlation_id, msg.msg_id, msg.sequence + 1);
    }
    this.processedMsgIds.add(msg.msg_id);

    const agent = this.agents.get(msg.receiver);
    if (!agent) {
      return createMessage(msg.receiver, msg.sender, 'response', {
        success: false,
        error: { code: 'AGENT_NOT_FOUND', message: `Agent ${msg.receiver} not registered` },
      }, msg.correlation_id, msg.msg_id, msg.sequence + 1);
    }

    const timeoutPromise = new Promise<AgentMessage>((_, reject) =>
      setTimeout(() => reject(new Error('Agent timeout')), MessageRouter.TIMEOUT_MS)
    );

    try {
      return await Promise.race([agent.handleMessage(msg), timeoutPromise]);
    } catch {
      return createMessage(msg.receiver, msg.sender, 'response', {
        success: false,
        display_text: '迷雾干扰了你的感知，请再试一次。',
        error: { code: 'TIMEOUT', message: 'Agent did not respond in time' },
      }, msg.correlation_id, msg.msg_id, msg.sequence + 1);
    }
  }

  createRoutedMessage(
    intent: PlayerIntent,
    payload: Record<string, unknown>,
    correlationId: string,
  ): AgentMessage | null {
    const rule = this.getRouteForIntent(intent);
    if (!rule) return null;
    return createMessage('game_master', rule.target, rule.action, payload, correlationId);
  }
}
