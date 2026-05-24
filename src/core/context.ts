export interface ContextSlice {
  player_snapshot: {
    hp: number;
    marks_count: number;
    items: string[];
  };
  scene: {
    scene_id: string | null;
    entry_count: number;
  };
  history_summary?: string;
  last_turn?: {
    player_input: string;
    agent_response: string;
  };
}

interface TurnRecord {
  player_input: string;
  agent_response: string;
  timestamp: number;
}

export class ContextManager {
  private sceneTurns: TurnRecord[] = [];
  private globalSummary: string = '';
  private currentSceneId: string | null = null;
  private sceneEntryCount: Map<string, number> = new Map();
  private sceneSummaries: string[] = [];

  private static readonly MAX_SCENE_TURNS = 5;

  setCurrentScene(sceneId: string): void {
    if (this.currentSceneId && this.currentSceneId !== sceneId) {
      this.compressSceneContext();
    }
    this.currentSceneId = sceneId;
    const count = this.sceneEntryCount.get(sceneId) ?? 0;
    this.sceneEntryCount.set(sceneId, count + 1);
  }

  recordTurn(playerInput: string, agentResponse: string): void {
    this.sceneTurns.push({ player_input: playerInput, agent_response: agentResponse, timestamp: Date.now() });
    if (this.sceneTurns.length > ContextManager.MAX_SCENE_TURNS) {
      this.sceneTurns.shift();
    }
  }

  getContextSlice(hp: number, marksCount: number, items: string[]): ContextSlice {
    const lastTurn = this.sceneTurns.length > 0 ? this.sceneTurns[this.sceneTurns.length - 1] : undefined;
    return {
      player_snapshot: { hp, marks_count: marksCount, items },
      scene: {
        scene_id: this.currentSceneId,
        entry_count: this.currentSceneId ? (this.sceneEntryCount.get(this.currentSceneId) ?? 1) : 0,
      },
      history_summary: this.globalSummary || undefined,
      last_turn: lastTurn ? { player_input: lastTurn.player_input, agent_response: lastTurn.agent_response } : undefined,
    };
  }

  getSceneEntryCount(sceneId: string): number {
    return this.sceneEntryCount.get(sceneId) ?? 0;
  }

  private compressSceneContext(): void {
    if (this.sceneTurns.length > 0) {
      const summary = `场景 ${this.currentSceneId}: ${this.sceneTurns.length} 轮交互`;
      this.sceneSummaries.push(summary);
      this.sceneTurns = [];
    }
    if (this.sceneSummaries.length >= 3) {
      this.globalSummary = this.sceneSummaries.join('; ');
      this.sceneSummaries = [];
    }
  }

  reset(): void {
    this.sceneTurns = [];
    this.globalSummary = '';
    this.currentSceneId = null;
    this.sceneEntryCount.clear();
    this.sceneSummaries = [];
  }
}
