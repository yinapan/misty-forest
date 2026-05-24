import { ContextManager } from './core/context';
import { MessageRouter } from './core/router';
import { GameMasterAgent } from './agents/game-master';
import { NarratorAgent } from './agents/narrator';
import { PuzzleMasterAgent } from './agents/puzzle-master';
import { StatusKeeperAgent } from './agents/status-keeper';
import { GuideAgent } from './agents/guide';
import { CliAdapter } from './interface/adapter';

export function createGame() {
  const context = new ContextManager();
  const router = new MessageRouter();

  const statusKeeper = new StatusKeeperAgent(context);
  const narrator = new NarratorAgent(context);
  const puzzleMaster = new PuzzleMasterAgent(context);
  const guide = new GuideAgent(context);
  const gameMaster = new GameMasterAgent(context, router, statusKeeper);

  router.registerAgent(statusKeeper);
  router.registerAgent(narrator);
  router.registerAgent(puzzleMaster);
  router.registerAgent(guide);
  router.registerAgent(gameMaster);

  return { gameMaster, statusKeeper, router, context };
}

async function main() {
  const adapter = new CliAdapter();
  const { gameMaster } = createGame();

  const intro = await gameMaster.startGame();
  adapter.write(intro);

  while (true) {
    const input = await adapter.read();

    if (/^(退出|quit|exit)$/i.test(input.trim())) {
      adapter.write('再见，冒险者！期待你的下次到来。');
      break;
    }

    if (/^(重新开始|restart|reset)$/i.test(input.trim())) {
      const intro = await gameMaster.startGame();
      adapter.write(intro);
      continue;
    }

    const response = await gameMaster.processPlayerInput(input);
    adapter.write(response);
  }

  adapter.close();
}

if (require.main === module) {
  main().catch(console.error);
}

export { GameMasterAgent } from './agents/game-master';
export { NarratorAgent } from './agents/narrator';
export { PuzzleMasterAgent } from './agents/puzzle-master';
export { StatusKeeperAgent } from './agents/status-keeper';
export { GuideAgent } from './agents/guide';
export { ContextManager } from './core/context';
export { MessageRouter } from './core/router';
export * from './core/message';
export * from './state/types';
