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
const particlesContainer = document.getElementById('particles')!;
const flashOverlay = document.getElementById('flash-overlay')!;
const fogSurge = document.getElementById('fog-surge')!;
const markCelebration = document.getElementById('mark-celebration')!;
const statusBar = document.getElementById('status-bar')!;
const sceneSilhouette = document.getElementById('scene-silhouette')!;

let game = createGame();
let processing = false;
let lastScene = '';
let lastHp = 100;
let lastMarks = 0;

interface SceneParticleConfig {
  types: string[];
  count: number;
  colors?: string[];
}

const SCENE_PARTICLES: Record<string, SceneParticleConfig> = {
  'S1': { types: ['bubble', 'firefly'], count: 30, colors: ['rgba(100, 180, 160, 0.3)', 'rgba(80, 150, 100, 0.4)'] },
  'S2': { types: ['leaf', 'sparkle'], count: 25, colors: ['rgba(80, 140, 60, 0.5)', 'rgba(120, 200, 80, 0.4)'] },
  'S3': { types: ['rune', 'sparkle'], count: 20, colors: ['rgba(180, 140, 255, 0.5)', 'rgba(200, 180, 100, 0.4)'] },
  'S4': { types: ['firefly', 'sparkle'], count: 40, colors: ['rgba(150, 230, 120, 0.6)', 'rgba(200, 220, 100, 0.5)'] },
  'S5': { types: ['shadow', 'rain'], count: 35, colors: ['rgba(30, 10, 40, 0.5)', 'rgba(150, 200, 255, 0.4)'] },
};

const SCENE_SILHOUETTES: Record<string, string> = {
  'S1': `<svg viewBox="0 0 1000 400" preserveAspectRatio="none"><path d="M0,400 L0,300 Q50,280 100,320 Q150,340 200,290 Q250,260 300,310 Q350,340 400,280 Q450,250 500,300 Q550,330 600,270 Q650,240 700,290 Q750,320 800,260 Q850,230 900,280 Q950,310 1000,250 L1000,400 Z" fill="rgba(10,30,20,0.8)"/><circle cx="150" cy="310" r="5" fill="rgba(100,180,160,0.3)"/><circle cx="400" cy="290" r="4" fill="rgba(100,180,160,0.2)"/><circle cx="700" cy="270" r="6" fill="rgba(100,180,160,0.25)"/></svg>`,
  'S2': `<svg viewBox="0 0 1000 400" preserveAspectRatio="none"><path d="M0,400 L0,250 Q30,200 60,230 L60,150 Q70,100 80,130 L80,230 Q100,210 120,250 L120,180 Q130,140 140,170 L140,250 Q180,220 200,260 L200,200 Q210,160 220,190 L220,260 Q280,230 320,270 L320,170 Q330,120 340,160 L340,270 Q400,240 450,280 L450,190 Q460,140 470,180 L470,280 Q550,250 600,290 L600,210 Q610,170 620,200 L620,290 Q700,260 750,300 L750,220 Q760,180 770,210 L770,300 Q850,270 900,310 L900,240 Q910,200 920,230 L920,310 Q960,290 1000,320 L1000,400 Z" fill="rgba(15,40,20,0.7)"/></svg>`,
  'S3': `<svg viewBox="0 0 1000 400" preserveAspectRatio="none"><path d="M0,400 L0,320 L50,320 L50,200 L70,200 L70,320 L150,320 L150,180 L170,180 L170,320 L300,320 L300,150 L320,150 L320,320 L450,320 L450,170 L470,170 L470,320 L600,320 L600,190 L620,190 L620,320 L750,320 L750,160 L770,160 L770,320 L900,320 L900,200 L920,200 L920,320 L1000,320 L1000,400 Z" fill="rgba(20,25,35,0.7)"/><rect x="55" y="210" width="10" height="3" fill="rgba(180,140,255,0.3)"/><rect x="155" y="190" width="10" height="3" fill="rgba(180,140,255,0.25)"/><rect x="305" y="160" width="10" height="3" fill="rgba(180,140,255,0.35)"/><rect x="455" y="180" width="10" height="3" fill="rgba(180,140,255,0.3)"/><rect x="755" y="170" width="10" height="3" fill="rgba(180,140,255,0.28)"/></svg>`,
  'S4': `<svg viewBox="0 0 1000 400" preserveAspectRatio="none"><path d="M0,400 L0,350 Q100,330 200,340 Q300,350 400,330 Q500,310 600,340 Q700,350 800,330 Q900,320 1000,340 L1000,400 Z" fill="rgba(10,35,20,0.6)"/><ellipse cx="100" cy="340" rx="30" ry="15" fill="rgba(20,60,30,0.4)"/><ellipse cx="350" cy="335" rx="25" ry="12" fill="rgba(20,60,30,0.35)"/><ellipse cx="600" cy="340" rx="35" ry="14" fill="rgba(20,60,30,0.4)"/><ellipse cx="850" cy="330" rx="28" ry="13" fill="rgba(20,60,30,0.35)"/></svg>`,
  'S5': `<svg viewBox="0 0 1000 400" preserveAspectRatio="none"><path d="M0,400 L0,200 Q100,250 200,180 Q300,120 400,200 Q500,280 600,150 Q700,80 800,180 Q900,250 1000,160 L1000,400 Z" fill="rgba(15,5,25,0.7)"/><path d="M200,180 L250,100 L300,180" fill="none" stroke="rgba(100,50,150,0.2)" stroke-width="1"/><path d="M600,150 L650,70 L700,150" fill="none" stroke="rgba(100,50,150,0.15)" stroke-width="1"/></svg>`,
};

function createParticlesForScene(sceneId: string) {
  particlesContainer.innerHTML = '';
  const config = SCENE_PARTICLES[sceneId] || SCENE_PARTICLES['S4'];

  for (let i = 0; i < config.count; i++) {
    const type = config.types[Math.floor(Math.random() * config.types.length)];
    const p = document.createElement('div');
    p.className = `particle particle-${type}`;
    p.style.left = `${Math.random() * 100}%`;
    p.style.top = `${Math.random() * 100}%`;
    p.style.animationDuration = `${6 + Math.random() * 14}s`;
    p.style.animationDelay = `${Math.random() * 8}s`;

    if (type === 'leaf') {
      p.style.width = `${6 + Math.random() * 6}px`;
      p.style.height = `${4 + Math.random() * 3}px`;
    } else if (type === 'rain') {
      p.style.height = `${10 + Math.random() * 15}px`;
      p.style.animationDuration = `${1 + Math.random() * 2}s`;
    } else if (type === 'firefly') {
      const size = 2 + Math.random() * 4;
      p.style.width = `${size}px`;
      p.style.height = `${size}px`;
    }

    particlesContainer.appendChild(p);
  }
}

function updateSilhouette(sceneId: string) {
  const svg = SCENE_SILHOUETTES[sceneId];
  if (svg) {
    sceneSilhouette.innerHTML = svg;
    sceneSilhouette.style.opacity = '0.15';
  }
}

function triggerFogSurge() {
  fogSurge.classList.remove('active');
  void fogSurge.offsetWidth;
  fogSurge.classList.add('active');
  setTimeout(() => fogSurge.classList.remove('active'), 1500);
}

function triggerFlash(type: 'red' | 'green') {
  flashOverlay.className = '';
  void flashOverlay.offsetWidth;
  flashOverlay.classList.add(`flash-${type}`);
  setTimeout(() => { flashOverlay.className = ''; }, type === 'red' ? 600 : 800);
}

function triggerMarkCelebration() {
  markCelebration.innerHTML = '';
  markCelebration.classList.add('active');

  for (let i = 0; i < 20; i++) {
    const spark = document.createElement('div');
    spark.className = 'mark-spark';
    const angle = (Math.PI * 2 * i) / 20;
    const distance = 80 + Math.random() * 120;
    const x = window.innerWidth / 2 + Math.cos(angle) * distance;
    const y = window.innerHeight / 2 + Math.sin(angle) * distance;
    spark.style.left = `${window.innerWidth / 2}px`;
    spark.style.top = `${window.innerHeight / 2}px`;
    spark.style.transition = `all ${0.5 + Math.random() * 0.5}s cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
    markCelebration.appendChild(spark);

    requestAnimationFrame(() => {
      spark.style.left = `${x}px`;
      spark.style.top = `${y}px`;
      spark.style.opacity = '0';
      spark.style.transform = `scale(0.3)`;
    });
  }

  setTimeout(() => {
    markCelebration.classList.remove('active');
    markCelebration.innerHTML = '';
  }, 1200);
}

function animateStatChange(elementId: string) {
  const el = document.getElementById(elementId);
  if (el) {
    el.classList.add('changed');
    const valueEl = el.querySelector('.stat-value');
    if (valueEl) {
      valueEl.classList.add('highlight');
      setTimeout(() => valueEl.classList.remove('highlight'), 600);
    }
    setTimeout(() => el.classList.remove('changed'), 500);
  }
}

function appendMessage(text: string, type: 'system' | 'player' | 'error' | 'success' = 'system') {
  const div = document.createElement('div');
  div.className = `message ${type}`;

  if (type === 'system' && text.length > 10) {
    div.classList.add('typewriter');
    let idx = 0;
    const speed = Math.max(15, Math.min(40, 800 / text.length));
    const typeInterval = setInterval(() => {
      idx++;
      div.textContent = text.slice(0, idx);
      if (idx >= text.length) {
        clearInterval(typeInterval);
        div.classList.remove('typewriter');
      }
      outputArea.scrollTop = outputArea.scrollHeight;
    }, speed);
  } else {
    div.textContent = text;
  }

  outputArea.appendChild(div);
  outputArea.scrollTop = outputArea.scrollHeight;
}

function updateStatus() {
  const state = game.statusKeeper.getState();
  const hp = state.player.hp;
  const maxHp = state.player.max_hp;
  const marks = state.player.marks.length;
  const items = state.player.items.length;

  if (hp !== lastHp) {
    hpText.textContent = `${hp}/${maxHp}`;
    const pct = (hp / maxHp) * 100;
    hpBar.style.width = `${pct}%`;
    hpBar.classList.toggle('danger', pct <= 25);
    hpBar.classList.toggle('warning', pct > 25 && pct <= 50);
    animateStatChange('stat-hp');

    if (hp < lastHp) {
      triggerFlash('red');
    }
    lastHp = hp;
  }

  if (marks !== lastMarks) {
    marksText.textContent = `${marks}/5`;
    animateStatChange('stat-marks');
    if (marks > lastMarks) {
      triggerFlash('green');
      triggerMarkCelebration();
    }
    lastMarks = marks;
  }

  itemsText.textContent = `${items}`;

  const currentScene = state.session.current_scene;
  if (currentScene && currentScene !== lastScene) {
    sceneName.classList.add('transitioning');
    triggerFogSurge();

    setTimeout(() => {
      const scene = SCENES.find(s => s.id === currentScene);
      if (scene) {
        sceneName.textContent = scene.name;
        sceneAtmosphere.textContent = scene.atmosphere;
      }
      sceneName.classList.remove('transitioning');
      createParticlesForScene(currentScene);
      updateSilhouette(currentScene);
      updateSceneColors(currentScene);
    }, 500);

    lastScene = currentScene;
  }
}

function updateSceneColors(sceneId: string) {
  const root = document.documentElement;
  switch (sceneId) {
    case 'S1':
      root.style.setProperty('--fog-color-1', 'rgba(15, 50, 40, 0.3)');
      root.style.setProperty('--fog-color-2', 'rgba(10, 40, 35, 0.25)');
      root.style.setProperty('--fog-color-3', 'rgba(20, 60, 45, 0.2)');
      break;
    case 'S2':
      root.style.setProperty('--fog-color-1', 'rgba(20, 60, 25, 0.3)');
      root.style.setProperty('--fog-color-2', 'rgba(15, 50, 20, 0.25)');
      root.style.setProperty('--fog-color-3', 'rgba(25, 70, 30, 0.2)');
      break;
    case 'S3':
      root.style.setProperty('--fog-color-1', 'rgba(30, 20, 50, 0.3)');
      root.style.setProperty('--fog-color-2', 'rgba(20, 15, 40, 0.25)');
      root.style.setProperty('--fog-color-3', 'rgba(25, 20, 45, 0.2)');
      break;
    case 'S4':
      root.style.setProperty('--fog-color-1', 'rgba(20, 60, 30, 0.25)');
      root.style.setProperty('--fog-color-2', 'rgba(15, 50, 25, 0.2)');
      root.style.setProperty('--fog-color-3', 'rgba(25, 70, 35, 0.15)');
      break;
    case 'S5':
      root.style.setProperty('--fog-color-1', 'rgba(30, 10, 40, 0.35)');
      root.style.setProperty('--fog-color-2', 'rgba(20, 5, 30, 0.3)');
      root.style.setProperty('--fog-color-3', 'rgba(25, 10, 35, 0.25)');
      break;
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
    lastScene = '';
    lastHp = 100;
    lastMarks = 0;
    triggerFogSurge();
    await startGame();
    processing = false;
    sendBtn.disabled = false;
    return;
  }

  try {
    const response = await game.gameMaster.processPlayerInput(input);
    const isSuccess = /正确|获得.*印记|通关/.test(response);
    const isError = /错误|失败|扣/.test(response);
    appendMessage(response, isSuccess ? 'success' : isError ? 'error' : 'system');
  } catch (e) {
    appendMessage('发生了未知错误，请重试。', 'error');
  }

  updateStatus();
  processing = false;
  sendBtn.disabled = false;
  playerInput.focus();
}

async function startGame() {
  createParticlesForScene('S4');
  updateSilhouette('S4');
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

startGame();
