import { ContextManager } from '../src/core/context';
import { MessageRouter } from '../src/core/router';
import { GameMasterAgent } from '../src/agents/game-master';
import { NarratorAgent } from '../src/agents/narrator';
import { PuzzleMasterAgent } from '../src/agents/puzzle-master';
import { StatusKeeperAgent } from '../src/agents/status-keeper';
import { GuideAgent } from '../src/agents/guide';
import { SCENES } from '../src/data/scenes';

function createGame() {
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

  return { gameMaster, statusKeeper };
}

const outputArea = document.getElementById('output-area')!;
const playerInput = document.getElementById('player-input') as HTMLInputElement;
const sendBtn = document.getElementById('send-btn') as HTMLButtonElement;
const hpText = document.getElementById('hp-text')!;
const hpBar = document.getElementById('hp-bar')!;
const marksText = document.getElementById('marks-text')!;
const itemsText = document.getElementById('items-text')!;
const sceneName = document.getElementById('scene-name')!;
const sceneAtmosphere = document.getElementById('scene-atmosphere')!;

let game = createGame();
let processing = false;

function appendMessage(text: string, type: 'system' | 'player' | 'error' | 'success' = 'system') {
  const div = document.createElement('div');
  div.className = `message ${type}`;
  div.textContent = text;
  outputArea.appendChild(div);
  outputArea.scrollTop = outputArea.scrollHeight;
}

function updateStatus() {
  const state = game.statusKeeper.getState();
  const hp = state.player.hp;
  const maxHp = state.player.max_hp;
  const marks = state.player.marks.length;
  const items = state.player.items.length;

  hpText.textContent = `${hp}/${maxHp}`;
  const pct = (hp / maxHp) * 100;
  hpBar.style.width = `${pct}%`;
  hpBar.classList.toggle('danger', pct <= 25);
  hpBar.classList.toggle('warning', pct > 25 && pct <= 50);

  marksText.textContent = `${marks}/5`;
  itemsText.textContent = `${items}`;

  const currentScene = state.session.current_scene;
  if (currentScene) {
    const scene = SCENES.find(s => s.id === currentScene);
    if (scene) {
      sceneName.textContent = scene.name;
      sceneAtmosphere.textContent = scene.atmosphere;
    }
  }
}

async function handleInput(input: string) {
  if (processing || !input.trim()) return;
  processing = true;
  sendBtn.disabled = true;
  playerInput.value = '';

  appendMessage(input, 'player');

  if (/^(退出|quit|exit)$/i.test(input.trim())) {
    appendMessage('再见，冒险者！期待你的下次到来。');
    processing = false;
    sendBtn.disabled = false;
    return;
  }

  if (/^(重新开始|restart|reset)$/i.test(input.trim())) {
    game = createGame();
    outputArea.innerHTML = '';
    await startGame();
    processing = false;
    sendBtn.disabled = false;
    return;
  }

  try {
    const response = await game.gameMaster.processPlayerInput(input);
    appendMessage(response);
  } catch (e) {
    appendMessage('发生了未知错误，请重试。', 'error');
  }

  updateStatus();
  processing = false;
  sendBtn.disabled = false;
  playerInput.focus();
}

async function startGame() {
  const intro = await game.gameMaster.startGame();
  appendMessage(intro);
  updateStatus();
  playerInput.focus();
}

sendBtn.addEventListener('click', () => handleInput(playerInput.value));
playerInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') handleInput(playerInput.value);
});

document.querySelectorAll('.quick-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const cmd = (btn as HTMLElement).dataset.cmd;
    if (cmd) handleInput(cmd);
  });
});

// Particle effect
function createParticles() {
  const container = document.getElementById('particles')!;
  for (let i = 0; i < 20; i++) {
    const p = document.createElement('div');
    p.className = 'particle';
    p.style.left = `${Math.random() * 100}%`;
    p.style.animationDuration = `${8 + Math.random() * 12}s`;
    p.style.animationDelay = `${Math.random() * 10}s`;
    p.style.width = `${2 + Math.random() * 3}px`;
    p.style.height = p.style.width;
    container.appendChild(p);
  }
}

createParticles();
startGame();
