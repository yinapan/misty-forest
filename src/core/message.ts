export type AgentRole = 'game_master' | 'narrator' | 'puzzle_master' | 'status_keeper' | 'guide';

export type ActionType =
  | 'render_scene'
  | 'render_ending'
  | 'generate_puzzle'
  | 'validate_answer'
  | 'request_hint'
  | 'modify_state'
  | 'query_state'
  | 'rollback_state'
  | 'show_tutorial'
  | 'handle_invalid'
  | 'show_help'
  | 'response';

export interface AgentMessage {
  msg_id: string;
  correlation_id: string;
  timestamp: number;
  sequence: number;
  sender: AgentRole;
  receiver: AgentRole;
  reply_to?: string;
  action: ActionType;
  payload: Record<string, unknown>;
  priority: 'normal' | 'high';
  ttl?: number;
}

export interface StateOperation {
  field: 'hp' | 'marks' | 'items' | 'consecutive_correct' | 'total_attempts' | 'game_status' | 'current_scene' | 'current_puzzle_id' | 'scenes_completed' | 'scenes_failed' | 'current_attempt' | 'hints_used_current' | 'turn_count';
  op: 'add' | 'subtract' | 'set' | 'push' | 'remove';
  value: number | string | boolean;
  reason: string;
}

export interface ResponsePayload {
  success: boolean;
  data?: Record<string, unknown>;
  display_text?: string;
  side_effects?: StateOperation[];
  error?: { code: string; message: string };
}

export interface RenderScenePayload {
  scene_id: string;
  trigger: 'enter' | 'explore' | 'look';
  player_context: {
    hp: number;
    marks_collected: string[];
  };
}

export interface GeneratePuzzlePayload {
  scene_id: string;
  variant_index: number;
  difficulty_modifier?: number;
}

export interface ValidateAnswerPayload {
  scene_id: string;
  puzzle_id: string;
  player_answer: string;
  attempt_number: number;
  hints_used: number;
}

export interface ModifyStatePayload {
  operations: StateOperation[];
}

export interface RequestHintPayload {
  scene_id: string;
  puzzle_id: string;
  current_hint_level: number;
}

let idCounter = 0;
function generateId(): string {
  return `msg_${Date.now()}_${++idCounter}`;
}

export function createMessage(
  sender: AgentRole,
  receiver: AgentRole,
  action: ActionType,
  payload: Record<string, unknown>,
  correlationId?: string,
  replyTo?: string,
  sequence?: number,
): AgentMessage {
  return {
    msg_id: generateId(),
    correlation_id: correlationId ?? generateId(),
    timestamp: Date.now(),
    sequence: sequence ?? 0,
    sender,
    receiver,
    reply_to: replyTo,
    action,
    payload,
    priority: 'normal',
  };
}

export function createResponse(
  originalMsg: AgentMessage,
  sender: AgentRole,
  payload: ResponsePayload,
): AgentMessage {
  return {
    msg_id: generateId(),
    correlation_id: originalMsg.correlation_id,
    timestamp: Date.now(),
    sequence: originalMsg.sequence + 1,
    sender,
    receiver: 'game_master',
    reply_to: originalMsg.msg_id,
    action: 'response',
    payload: payload as unknown as Record<string, unknown>,
    priority: 'normal',
  };
}
