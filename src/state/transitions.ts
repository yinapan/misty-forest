import { StateOperation } from '../core/message';
import { GameState } from './types';

export function applyOperation(state: GameState, op: StateOperation): GameState {
  const newState = JSON.parse(JSON.stringify(state)) as GameState;

  switch (op.field) {
    case 'hp': {
      const val = op.value as number;
      if (op.op === 'add') newState.player.hp = Math.min(newState.player.max_hp, newState.player.hp + val);
      else if (op.op === 'subtract') newState.player.hp = Math.max(0, newState.player.hp - val);
      else if (op.op === 'set') newState.player.hp = Math.max(0, Math.min(newState.player.max_hp, val));
      break;
    }
    case 'marks': {
      const sceneId = op.value as string;
      if (op.op === 'push') {
        if (!newState.player.marks.some(m => m.scene_id === sceneId)) {
          newState.player.marks.push({ scene_id: sceneId, obtained_at: Date.now() });
        }
      } else if (op.op === 'remove') {
        newState.player.marks = newState.player.marks.filter(m => m.scene_id !== sceneId);
      }
      break;
    }
    case 'items': {
      if (op.op === 'push') {
        if (newState.player.items.length < 3) {
          newState.player.items.push({
            id: `item_${Date.now()}`,
            name: op.value as string,
            effect: getItemEffect(op.value as string),
            obtained_at: Date.now(),
          });
        }
      } else if (op.op === 'remove') {
        const idx = newState.player.items.findIndex(i => i.name === op.value);
        if (idx >= 0) newState.player.items.splice(idx, 1);
      }
      break;
    }
    case 'consecutive_correct': {
      const val = op.value as number;
      if (op.op === 'add') newState.player.consecutive_correct += val;
      else if (op.op === 'set') newState.player.consecutive_correct = val;
      break;
    }
    case 'total_attempts': {
      const val = op.value as number;
      if (op.op === 'add') newState.player.total_attempts += val;
      else if (op.op === 'set') newState.player.total_attempts = val;
      break;
    }
    case 'game_status':
      if (op.op === 'set') newState.session.game_status = op.value as 'active' | 'victory' | 'defeated';
      break;
    case 'current_scene':
      if (op.op === 'set') newState.session.current_scene = op.value as string | null;
      break;
    case 'current_puzzle_id':
      if (op.op === 'set') newState.session.current_puzzle_id = op.value as string | null;
      break;
    case 'scenes_completed': {
      if (op.op === 'push' && !newState.session.scenes_completed.includes(op.value as string)) {
        newState.session.scenes_completed.push(op.value as string);
      }
      break;
    }
    case 'scenes_failed': {
      const sceneId = op.value as string;
      if (op.op === 'push' && !newState.session.scenes_failed.includes(sceneId)) {
        newState.session.scenes_failed.push(sceneId);
      } else if (op.op === 'remove') {
        newState.session.scenes_failed = newState.session.scenes_failed.filter(s => s !== sceneId);
      }
      break;
    }
    case 'current_attempt': {
      const val = op.value as number;
      if (op.op === 'add') newState.session.current_attempt += val;
      else if (op.op === 'set') newState.session.current_attempt = val;
      break;
    }
    case 'hints_used_current': {
      const val = op.value as number;
      if (op.op === 'add') newState.session.hints_used_current += val;
      else if (op.op === 'set') newState.session.hints_used_current = val;
      break;
    }
    case 'turn_count': {
      const val = op.value as number;
      if (op.op === 'add') newState.session.turn_count += val;
      else if (op.op === 'set') newState.session.turn_count = val;
      break;
    }
  }

  newState.version++;
  return newState;
}

function getItemEffect(name: string): 'heal' | 'free_hint' | 'extra_turn' {
  if (name === '生命露珠') return 'heal';
  if (name === '迷雾灯笼') return 'free_hint';
  return 'extra_turn';
}
