import { AgentMessage, AgentRole, ResponsePayload, createResponse } from './message';
import { ContextManager } from './context';

export abstract class BaseAgent {
  protected role: AgentRole;
  protected context: ContextManager;

  constructor(role: AgentRole, context: ContextManager) {
    this.role = role;
    this.context = context;
  }

  abstract handleMessage(msg: AgentMessage): Promise<AgentMessage>;

  protected buildResponse(originalMsg: AgentMessage, payload: ResponsePayload): AgentMessage {
    return createResponse(originalMsg, this.role, payload);
  }

  getRole(): AgentRole {
    return this.role;
  }
}
