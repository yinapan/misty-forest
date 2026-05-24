import { GameState } from './types';

export function createInitialState(): GameState {
  return {
    version: 0,
    player: {
      hp: 100,
      max_hp: 100,
      marks: [],
      items: [],
      consecutive_correct: 0,
      total_attempts: 0,
    },
    session: {
      game_status: 'active',
      current_scene: null,
      current_puzzle_id: null,
      scenes_completed: [],
      scenes_failed: [],
      current_attempt: 0,
      hints_used_current: 0,
      turn_count: 0,
      start_time: Date.now(),
    },
  };
}
