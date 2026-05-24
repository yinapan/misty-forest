export interface SceneMark {
  scene_id: string;
  obtained_at: number;
}

export interface Item {
  id: string;
  name: string;
  effect: 'heal' | 'free_hint' | 'extra_turn';
  obtained_at: number;
}

export interface PlayerState {
  hp: number;
  max_hp: number;
  marks: SceneMark[];
  items: Item[];
  consecutive_correct: number;
  total_attempts: number;
}

export interface SessionState {
  game_status: 'active' | 'victory' | 'defeated';
  current_scene: string | null;
  current_puzzle_id: string | null;
  scenes_completed: string[];
  scenes_failed: string[];
  current_attempt: number;
  hints_used_current: number;
  turn_count: number;
  start_time: number;
}

export interface GameState {
  version: number;
  player: PlayerState;
  session: SessionState;
}
