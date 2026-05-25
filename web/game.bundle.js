"use strict";
(() => {
  // src/core/context.ts
  var _ContextManager = class _ContextManager {
    constructor() {
      this.sceneTurns = [];
      this.globalSummary = "";
      this.currentSceneId = null;
      this.sceneEntryCount = /* @__PURE__ */ new Map();
      this.sceneSummaries = [];
    }
    setCurrentScene(sceneId) {
      if (this.currentSceneId && this.currentSceneId !== sceneId) {
        this.compressSceneContext();
      }
      this.currentSceneId = sceneId;
      const count = this.sceneEntryCount.get(sceneId) ?? 0;
      this.sceneEntryCount.set(sceneId, count + 1);
    }
    recordTurn(playerInput2, agentResponse) {
      this.sceneTurns.push({ player_input: playerInput2, agent_response: agentResponse, timestamp: Date.now() });
      if (this.sceneTurns.length > _ContextManager.MAX_SCENE_TURNS) {
        this.sceneTurns.shift();
      }
    }
    getContextSlice(hp, marksCount, items) {
      const lastTurn = this.sceneTurns.length > 0 ? this.sceneTurns[this.sceneTurns.length - 1] : void 0;
      return {
        player_snapshot: { hp, marks_count: marksCount, items },
        scene: {
          scene_id: this.currentSceneId,
          entry_count: this.currentSceneId ? this.sceneEntryCount.get(this.currentSceneId) ?? 1 : 0
        },
        history_summary: this.globalSummary || void 0,
        last_turn: lastTurn ? { player_input: lastTurn.player_input, agent_response: lastTurn.agent_response } : void 0
      };
    }
    getSceneEntryCount(sceneId) {
      return this.sceneEntryCount.get(sceneId) ?? 0;
    }
    compressSceneContext() {
      if (this.sceneTurns.length > 0) {
        const summary = `\u573A\u666F ${this.currentSceneId}: ${this.sceneTurns.length} \u8F6E\u4EA4\u4E92`;
        this.sceneSummaries.push(summary);
        this.sceneTurns = [];
      }
      if (this.sceneSummaries.length >= 3) {
        this.globalSummary = this.sceneSummaries.join("; ");
        this.sceneSummaries = [];
      }
    }
    reset() {
      this.sceneTurns = [];
      this.globalSummary = "";
      this.currentSceneId = null;
      this.sceneEntryCount.clear();
      this.sceneSummaries = [];
    }
  };
  _ContextManager.MAX_SCENE_TURNS = 5;
  var ContextManager = _ContextManager;

  // src/core/message.ts
  var idCounter = 0;
  function generateId() {
    return `msg_${Date.now()}_${++idCounter}`;
  }
  function createMessage(sender, receiver, action, payload, correlationId, replyTo, sequence) {
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
      priority: "normal"
    };
  }
  function createResponse(originalMsg, sender, payload) {
    return {
      msg_id: generateId(),
      correlation_id: originalMsg.correlation_id,
      timestamp: Date.now(),
      sequence: originalMsg.sequence + 1,
      sender,
      receiver: "game_master",
      reply_to: originalMsg.msg_id,
      action: "response",
      payload,
      priority: "normal"
    };
  }

  // src/core/router.ts
  var ROUTE_TABLE = [
    { intent: "answer", target: "puzzle_master", action: "validate_answer" },
    { intent: "hint", target: "puzzle_master", action: "request_hint" },
    { intent: "status", target: "status_keeper", action: "query_state" },
    { intent: "use_item", target: "status_keeper", action: "modify_state" },
    { intent: "help", target: "guide", action: "show_help" },
    { intent: "explore", target: "narrator", action: "render_scene" },
    { intent: "skip", target: "puzzle_master", action: "validate_answer" },
    { intent: "invalid", target: "guide", action: "handle_invalid" }
  ];
  var _MessageRouter = class _MessageRouter {
    constructor() {
      this.agents = /* @__PURE__ */ new Map();
      this.processedMsgIds = /* @__PURE__ */ new Set();
    }
    registerAgent(agent) {
      this.agents.set(agent.getRole(), agent);
    }
    getRouteForIntent(intent) {
      return ROUTE_TABLE.find((rule) => rule.intent === intent);
    }
    async routeMessage(msg) {
      if (this.processedMsgIds.has(msg.msg_id)) {
        return createMessage(msg.receiver, msg.sender, "response", {
          success: true,
          display_text: "\uFF08\u6D88\u606F\u5DF2\u5904\u7406\uFF09"
        }, msg.correlation_id, msg.msg_id, msg.sequence + 1);
      }
      this.processedMsgIds.add(msg.msg_id);
      const agent = this.agents.get(msg.receiver);
      if (!agent) {
        return createMessage(msg.receiver, msg.sender, "response", {
          success: false,
          error: { code: "AGENT_NOT_FOUND", message: `Agent ${msg.receiver} not registered` }
        }, msg.correlation_id, msg.msg_id, msg.sequence + 1);
      }
      const timeoutPromise = new Promise(
        (_, reject) => setTimeout(() => reject(new Error("Agent timeout")), _MessageRouter.TIMEOUT_MS)
      );
      try {
        return await Promise.race([agent.handleMessage(msg), timeoutPromise]);
      } catch {
        return createMessage(msg.receiver, msg.sender, "response", {
          success: false,
          display_text: "\u8FF7\u96FE\u5E72\u6270\u4E86\u4F60\u7684\u611F\u77E5\uFF0C\u8BF7\u518D\u8BD5\u4E00\u6B21\u3002",
          error: { code: "TIMEOUT", message: "Agent did not respond in time" }
        }, msg.correlation_id, msg.msg_id, msg.sequence + 1);
      }
    }
    createRoutedMessage(intent, payload, correlationId) {
      const rule = this.getRouteForIntent(intent);
      if (!rule) return null;
      return createMessage("game_master", rule.target, rule.action, payload, correlationId);
    }
  };
  _MessageRouter.TIMEOUT_MS = 1e4;
  var MessageRouter = _MessageRouter;

  // src/core/agent-base.ts
  var BaseAgent = class {
    constructor(role, context) {
      this.role = role;
      this.context = context;
    }
    buildResponse(originalMsg, payload) {
      return createResponse(originalMsg, this.role, payload);
    }
    getRole() {
      return this.role;
    }
  };

  // src/data/scenes.ts
  var SCENES = [
    { id: "S1", name: "\u5E7D\u6697\u6CBC\u6CFD", environment: "\u6D53\u96FE\u5F25\u6F2B\u3001\u67AF\u6728\u904D\u5730\u3001\u6C34\u9762\u5192\u6CE1", atmosphere: "\u538B\u6291\u3001\u5371\u9669", puzzle_type: "logic" },
    { id: "S2", name: "\u53E4\u6811\u8FF7\u5BAB", environment: "\u5DE8\u6728\u73AF\u7ED5\u3001\u8DEF\u5F84\u4EA4\u9519\u3001\u82D4\u85D3\u53D1\u5149", atmosphere: "\u8FF7\u60D1\u3001\u795E\u79D8", puzzle_type: "pattern" },
    { id: "S3", name: "\u9057\u5FD8\u795E\u6BBF", environment: "\u77F3\u7891\u6797\u7ACB\u3001\u7B26\u6587\u95EA\u70C1\u3001\u56DE\u97F3\u73AF\u7ED5", atmosphere: "\u5E84\u4E25\u3001\u53E4\u8001", puzzle_type: "cipher" },
    { id: "S4", name: "\u8424\u706B\u866B\u8C37", environment: "\u6F2B\u5929\u5149\u70B9\u3001\u6EAA\u6D41\u6F7A\u6F7A\u3001\u82B1\u4E1B\u9690\u853D", atmosphere: "\u5B81\u9759\u3001\u6697\u85CF\u7384\u673A", puzzle_type: "observation" },
    { id: "S5", name: "\u6697\u5F71\u88C2\u9699", environment: "\u7A7A\u95F4\u626D\u66F2\u3001\u5F71\u5B50\u6E38\u79FB\u3001\u4F4E\u8BED\u5462\u5583", atmosphere: "\u6050\u6016\u3001\u7D27\u8FEB", puzzle_type: "decision" }
  ];
  function getScene(id) {
    return SCENES.find((s) => s.id === id);
  }

  // src/data/constants.ts
  var HP = {
    INITIAL: 100,
    MAX: 100,
    CORRECT_FIRST: 10,
    CORRECT_WITH_HINT: 5,
    WRONG_FIRST: 10,
    WRONG_SECOND: 15,
    WRONG_THIRD: 20,
    HINT_LEVEL_1: 5,
    HINT_LEVEL_2: 10,
    HINT_LEVEL_3: 15,
    HEAL_ITEM: 20,
    TRAP_MIN: 10,
    TRAP_MAX: 20
  };
  var GAME = {
    MARKS_TO_WIN: 5,
    MAX_ATTEMPTS_PER_PUZZLE: 3,
    MAX_HINTS_PER_PUZZLE: 3,
    MAX_ITEMS: 3,
    ITEM_DROP_CHANCE: 0.3
  };
  var HINT_COSTS = [HP.HINT_LEVEL_1, HP.HINT_LEVEL_2, HP.HINT_LEVEL_3];

  // src/agents/game-master/index.ts
  var GameMasterAgent = class extends BaseAgent {
    constructor(context, router, statusKeeper) {
      super("game_master", context);
      this.router = router;
      this.statusKeeper = statusKeeper;
    }
    async handleMessage(msg) {
      return this.buildResponse(msg, { success: true, display_text: "" });
    }
    parseIntent(input) {
      const trimmed = input.trim().toLowerCase();
      if (/^(提示|hint)$/.test(trimmed)) return "hint";
      if (/^(状态|status)$/.test(trimmed)) return "status";
      if (/^(帮助|help|\?)$/.test(trimmed)) return "help";
      if (/^(探索|look|查看|观察)$/.test(trimmed)) return "explore";
      if (/^(放弃|skip|跳过)$/.test(trimmed)) return "skip";
      if (/^(道具|item|使用|用)/.test(trimmed)) return "use_item";
      if (trimmed.length === 0) return "invalid";
      return "answer";
    }
    async processPlayerInput(input) {
      const state = this.statusKeeper.getState();
      if (state.session.game_status !== "active") {
        return '\u6E38\u620F\u5DF2\u7ED3\u675F\u3002\u8F93\u5165"\u91CD\u65B0\u5F00\u59CB"\u5F00\u59CB\u65B0\u7684\u5192\u9669\u3002';
      }
      await this.router.routeMessage(createMessage(
        "game_master",
        "status_keeper",
        "modify_state",
        { operations: [{ field: "turn_count", op: "add", value: 1, reason: "\u65B0\u56DE\u5408" }] },
        `turn_${Date.now()}`
      ));
      const intent = this.parseIntent(input);
      let result;
      switch (intent) {
        case "answer":
          result = await this.handleAnswer(input);
          break;
        case "hint":
          result = await this.handleHint();
          break;
        case "status":
          result = this.getStatusDisplay();
          break;
        case "help":
          result = await this.handleHelp();
          break;
        case "explore":
          result = await this.handleExplore();
          break;
        case "skip":
          result = await this.handleSkip();
          break;
        case "use_item":
          result = await this.handleUseItem(input);
          break;
        case "invalid":
        default:
          result = await this.handleInvalid(input);
          break;
      }
      this.context.recordTurn(input, result);
      const updatedState = this.statusKeeper.getState();
      if (updatedState.session.game_status === "defeated") {
        const ending = await this.router.routeMessage(createMessage(
          "game_master",
          "narrator",
          "render_ending",
          { ending_type: "defeated", stats: { marks: updatedState.player.marks.length, attempts: updatedState.player.total_attempts, hp: 0 } }
        ));
        const endPayload = ending.payload;
        result += "\n\n" + (endPayload.display_text ?? "");
      } else if (updatedState.session.game_status === "victory") {
        const endingType = updatedState.player.hp === updatedState.player.max_hp ? "perfect" : "victory";
        const ending = await this.router.routeMessage(createMessage(
          "game_master",
          "narrator",
          "render_ending",
          { ending_type: endingType, stats: { marks: 5, attempts: updatedState.player.total_attempts, hp: updatedState.player.hp } }
        ));
        const endPayload = ending.payload;
        result += "\n\n" + (endPayload.display_text ?? "");
      }
      return result;
    }
    async startGame() {
      this.statusKeeper.resetState();
      this.context.reset();
      const tutorialMsg = createMessage("game_master", "guide", "show_tutorial", {});
      const tutorialResp = await this.router.routeMessage(tutorialMsg);
      const tutorialText = tutorialResp.payload.display_text ?? "";
      const sceneText = await this.enterNewScene();
      return tutorialText + "\n" + sceneText;
    }
    async enterNewScene() {
      const state = this.statusKeeper.getState();
      const completed = state.session.scenes_completed;
      const available = SCENES.filter((s) => !completed.includes(s.id));
      if (available.length === 0) {
        return "\u6240\u6709\u573A\u666F\u5DF2\u5B8C\u6210\uFF01";
      }
      const failed = state.session.scenes_failed;
      const weighted = available.flatMap((s) => failed.includes(s.id) ? [s, s, s] : [s]);
      const selected = weighted[Math.floor(Math.random() * weighted.length)];
      this.context.setCurrentScene(selected.id);
      const entryCount = this.context.getSceneEntryCount(selected.id);
      await this.router.routeMessage(createMessage(
        "game_master",
        "status_keeper",
        "modify_state",
        { operations: [
          { field: "current_scene", op: "set", value: selected.id, reason: "\u8FDB\u5165\u65B0\u573A\u666F" },
          { field: "current_attempt", op: "set", value: 0, reason: "\u91CD\u7F6E" },
          { field: "hints_used_current", op: "set", value: 0, reason: "\u91CD\u7F6E" }
        ] }
      ));
      if (failed.includes(selected.id)) {
        await this.router.routeMessage(createMessage(
          "game_master",
          "status_keeper",
          "modify_state",
          { operations: [{ field: "scenes_failed", op: "remove", value: selected.id, reason: "\u91CD\u65B0\u6311\u6218" }] }
        ));
      }
      const sceneResp = await this.router.routeMessage(createMessage(
        "game_master",
        "narrator",
        "render_scene",
        { scene_id: selected.id, trigger: "enter", player_context: { hp: state.player.hp, marks_collected: completed } }
      ));
      const sceneText = sceneResp.payload.display_text ?? "";
      const puzzleResp = await this.router.routeMessage(createMessage(
        "game_master",
        "puzzle_master",
        "generate_puzzle",
        { scene_id: selected.id, variant_index: entryCount - 1 }
      ));
      const puzzlePayload = puzzleResp.payload;
      const puzzleText = puzzlePayload.display_text ?? "";
      if (puzzlePayload.data?.puzzle_id) {
        await this.router.routeMessage(createMessage(
          "game_master",
          "status_keeper",
          "modify_state",
          { operations: [{ field: "current_puzzle_id", op: "set", value: puzzlePayload.data.puzzle_id, reason: "\u65B0\u8C1C\u9898" }] }
        ));
      }
      return sceneText + "\n" + puzzleText;
    }
    async handleAnswer(input) {
      const state = this.statusKeeper.getState();
      if (!state.session.current_scene || !state.session.current_puzzle_id) {
        return "\u5F53\u524D\u6CA1\u6709\u6D3B\u8DC3\u7684\u8C1C\u9898\u3002";
      }
      const resp = await this.router.routeMessage(createMessage(
        "game_master",
        "puzzle_master",
        "validate_answer",
        {
          scene_id: state.session.current_scene,
          puzzle_id: state.session.current_puzzle_id,
          player_answer: input,
          attempt_number: state.session.current_attempt + 1,
          hints_used: state.session.hints_used_current
        }
      ));
      const payload = resp.payload;
      await this.applySideEffects(payload.side_effects, resp.correlation_id);
      let result = payload.display_text ?? "";
      await this.router.routeMessage(createMessage(
        "game_master",
        "status_keeper",
        "modify_state",
        { operations: [{ field: "total_attempts", op: "add", value: 1, reason: "\u7B54\u9898" }] }
      ));
      if (payload.data?.correct || payload.data?.failed_out || payload.data?.skipped) {
        const updatedState = this.statusKeeper.getState();
        if (updatedState.session.game_status === "active") {
          const nextScene = await this.enterNewScene();
          result += "\n\n" + nextScene;
        }
      }
      return result;
    }
    async handleHint() {
      const state = this.statusKeeper.getState();
      if (!state.session.current_scene || !state.session.current_puzzle_id) {
        return "\u5F53\u524D\u6CA1\u6709\u6D3B\u8DC3\u7684\u8C1C\u9898\uFF0C\u65E0\u6CD5\u8BF7\u6C42\u63D0\u793A\u3002";
      }
      const hasLantern = state.player.items.some((i) => i.name === "\u8FF7\u96FE\u706F\u7B3C");
      if (hasLantern) {
        await this.router.routeMessage(createMessage(
          "game_master",
          "status_keeper",
          "modify_state",
          { operations: [{ field: "items", op: "remove", value: "\u8FF7\u96FE\u706F\u7B3C", reason: "\u4F7F\u7528\u8FF7\u96FE\u706F\u7B3C\u514D\u8D39\u63D0\u793A" }] }
        ));
      }
      const resp = await this.router.routeMessage(createMessage(
        "game_master",
        "puzzle_master",
        "request_hint",
        { scene_id: state.session.current_scene, puzzle_id: state.session.current_puzzle_id, current_hint_level: state.session.hints_used_current }
      ));
      const payload = resp.payload;
      if (!hasLantern) {
        await this.applySideEffects(payload.side_effects, resp.correlation_id);
      } else {
        await this.router.routeMessage(createMessage(
          "game_master",
          "status_keeper",
          "modify_state",
          { operations: [{ field: "hints_used_current", op: "add", value: 1, reason: "\u4F7F\u7528\u514D\u8D39\u63D0\u793A" }] }
        ));
      }
      let text = payload.display_text ?? "";
      if (hasLantern) {
        text = "\u{1F526} \u8FF7\u96FE\u706F\u7B3C\u53D1\u51FA\u5149\u8292\uFF0C\u514D\u8D39\u83B7\u5F97\u63D0\u793A\uFF01\n" + text;
      }
      return text;
    }
    getStatusDisplay() {
      const state = this.statusKeeper.getState();
      const marks = state.player.marks.map((m) => m.scene_id).join(", ") || "\u65E0";
      const items = state.player.items.map((i) => i.name).join(", ") || "\u65E0";
      const sceneName2 = state.session.current_scene ? SCENES.find((s) => s.id === state.session.current_scene)?.name ?? state.session.current_scene : "\u65E0";
      return `
\u{1F4CA} \u5F53\u524D\u72B6\u6001\uFF1A
\u2764\uFE0F  HP: ${state.player.hp}/${state.player.max_hp}
\u{1F52E} \u5370\u8BB0: ${state.player.marks.length}/5 [${marks}]
\u{1F392} \u9053\u5177: ${items}
\u{1F4CD} \u5F53\u524D\u573A\u666F: ${sceneName2}
\u{1F522} \u5F53\u524D\u5C1D\u8BD5: ${state.session.current_attempt}/${GAME.MAX_ATTEMPTS_PER_PUZZLE}
\u{1F4A1} \u5DF2\u7528\u63D0\u793A: ${state.session.hints_used_current}/${GAME.MAX_HINTS_PER_PUZZLE}
\u{1F3C6} \u8FDE\u7EED\u6B63\u786E: ${state.player.consecutive_correct}
`.trim();
    }
    async handleHelp() {
      const resp = await this.router.routeMessage(createMessage("game_master", "guide", "show_help", {}));
      return resp.payload.display_text ?? "";
    }
    async handleExplore() {
      const state = this.statusKeeper.getState();
      if (!state.session.current_scene) return "\u4F60\u8FD8\u6CA1\u6709\u8FDB\u5165\u4EFB\u4F55\u573A\u666F\u3002";
      const resp = await this.router.routeMessage(createMessage(
        "game_master",
        "narrator",
        "render_scene",
        { scene_id: state.session.current_scene, trigger: "explore", player_context: { hp: state.player.hp, marks_collected: state.session.scenes_completed } }
      ));
      return resp.payload.display_text ?? "";
    }
    async handleSkip() {
      const state = this.statusKeeper.getState();
      if (!state.session.current_scene) return "\u5F53\u524D\u6CA1\u6709\u53EF\u8DF3\u8FC7\u7684\u8C1C\u9898\u3002";
      const resp = await this.router.routeMessage(createMessage(
        "game_master",
        "puzzle_master",
        "validate_answer",
        { scene_id: state.session.current_scene, puzzle_id: state.session.current_puzzle_id, player_answer: "", attempt_number: 0, hints_used: 0, force_skip: true }
      ));
      const payload = resp.payload;
      await this.applySideEffects(payload.side_effects, resp.correlation_id);
      let result = payload.display_text ?? "";
      const updatedState = this.statusKeeper.getState();
      if (updatedState.session.game_status === "active") {
        const nextScene = await this.enterNewScene();
        result += "\n\n" + nextScene;
      }
      return result;
    }
    async handleUseItem(input) {
      const state = this.statusKeeper.getState();
      const itemNames = state.player.items.map((i) => i.name);
      if (itemNames.length === 0) return "\u4F60\u6CA1\u6709\u4EFB\u4F55\u9053\u5177\u53EF\u4EE5\u4F7F\u7528\u3002";
      const targetItem = itemNames.find((name) => input.includes(name));
      if (!targetItem) {
        return `\u53EF\u7528\u9053\u5177\uFF1A${itemNames.join("\u3001")}
\u8F93\u5165"\u4F7F\u7528 [\u9053\u5177\u540D]"\u6765\u4F7F\u7528\u3002`;
      }
      const ops = [{ field: "items", op: "remove", value: targetItem, reason: "\u73A9\u5BB6\u4F7F\u7528" }];
      if (targetItem === "\u751F\u547D\u9732\u73E0") {
        ops.push({ field: "hp", op: "add", value: 20, reason: "\u4F7F\u7528\u751F\u547D\u9732\u73E0" });
      }
      await this.router.routeMessage(createMessage(
        "game_master",
        "status_keeper",
        "modify_state",
        { operations: ops }
      ));
      if (targetItem === "\u751F\u547D\u9732\u73E0") return "\u{1F4A7} \u4F7F\u7528\u4E86\u751F\u547D\u9732\u73E0\uFF0C\u6062\u590D 20 HP\uFF01";
      if (targetItem === "\u8FF7\u96FE\u706F\u7B3C") return "\u{1F526} \u8FF7\u96FE\u706F\u7B3C\u5DF2\u6FC0\u6D3B\uFF0C\u4E0B\u6B21\u8BF7\u6C42\u63D0\u793A\u5C06\u514D\u8D39\uFF01";
      if (targetItem === "\u65F6\u95F4\u6C99\u6F0F") return "\u23F3 \u65F6\u95F4\u6C99\u6F0F\u5DF2\u4F7F\u7528\uFF0C\u989D\u5916\u83B7\u5F97\u4E00\u6B21\u7B54\u9898\u673A\u4F1A\uFF01";
      return `\u5DF2\u4F7F\u7528 ${targetItem}\u3002`;
    }
    async handleInvalid(input) {
      const resp = await this.router.routeMessage(createMessage(
        "game_master",
        "guide",
        "handle_invalid",
        { player_input: input }
      ));
      return resp.payload.display_text ?? "";
    }
    async applySideEffects(effects, correlationId) {
      if (!effects || effects.length === 0) return;
      await this.router.routeMessage(createMessage(
        "game_master",
        "status_keeper",
        "modify_state",
        { operations: effects },
        correlationId
      ));
    }
  };

  // src/agents/narrator/index.ts
  var SCENE_DESCRIPTIONS = {
    S1: [
      "\u6D53\u96FE\u4ECE\u56DB\u9762\u516B\u65B9\u6D8C\u6765\uFF0C\u811A\u4E0B\u7684\u6CBC\u6CFD\u5730\u5192\u7740\u6C14\u6CE1\uFF0C\u67AF\u6B7B\u7684\u6811\u6728\u5982\u540C\u626D\u66F2\u7684\u624B\u81C2\u4F38\u5411\u7070\u6697\u7684\u5929\u7A7A\u3002\u7A7A\u6C14\u4E2D\u5F25\u6F2B\u7740\u8150\u70C2\u7684\u6C14\u606F\uFF0C\u5076\u5C14\u4F20\u6765\u4E0D\u77E5\u540D\u751F\u7269\u7684\u4F4E\u541F\u3002\u4F60\u611F\u5230\u4E00\u79CD\u65E0\u5F62\u7684\u538B\u8FEB\u611F\u6B63\u5728\u903C\u8FD1\u2026\u2026",
      '\u6CBC\u6CFD\u6DF1\u5904\u4F20\u6765\u9635\u9635"\u5495\u565C"\u58F0\uFF0C\u96FE\u6C14\u5982\u540C\u6D3B\u7269\u822C\u8815\u52A8\u3002\u524D\u65B9\u9690\u7EA6\u53EF\u89C1\u4E09\u6761\u5C0F\u5F84\uFF0C\u5730\u9762\u4E0A\u6563\u843D\u7740\u5947\u602A\u7684\u6807\u8BB0\u3002\u8FDC\u5904\u6709\u5FAE\u5F31\u7684\u5149\u8292\u5728\u96FE\u4E2D\u95EA\u70C1\uFF0C\u4EFF\u4F5B\u5728\u5F15\u5BFC\u7740\u4EC0\u4E48\u3002',
      "\u811A\u4E0B\u7684\u5730\u9762\u5F00\u59CB\u53D8\u8F6F\uFF0C\u6D51\u6D4A\u7684\u6C34\u9762\u6620\u51FA\u4F60\u6A21\u7CCA\u7684\u5012\u5F71\u3002\u67AF\u6728\u4E0A\u523B\u7740\u53E4\u8001\u7684\u7B26\u53F7\uFF0C\u4F3C\u4E4E\u5728\u8BB2\u8FF0\u67D0\u4E2A\u88AB\u9057\u5FD8\u7684\u6545\u4E8B\u3002\u4E00\u53EA\u4E4C\u9E26\u505C\u5728\u6700\u9AD8\u7684\u67AF\u679D\u4E0A\uFF0C\u9ED1\u8272\u7684\u773C\u775B\u4F3C\u4E4E\u770B\u900F\u4E86\u4E00\u5207\u3002"
    ],
    S2: [
      "\u5DE8\u5927\u7684\u53E4\u6811\u906E\u5929\u853D\u65E5\uFF0C\u6811\u6839\u5982\u86C7\u822C\u4EA4\u9519\u76D8\u65CB\u3002\u82D4\u85D3\u6563\u53D1\u7740\u5E7D\u5E7D\u7684\u7EFF\u5149\uFF0C\u4E3A\u8FD9\u7247\u65E0\u5C3D\u7684\u8FF7\u5BAB\u63D0\u4F9B\u4E86\u552F\u4E00\u7684\u7167\u660E\u3002\u6BCF\u68F5\u6811\u90FD\u50CF\u662F\u6709\u4E86\u751F\u547D\uFF0C\u4F3C\u4E4E\u5728\u968F\u7740\u4F60\u7684\u79FB\u52A8\u800C\u7F13\u7F13\u8F6C\u52A8\u2026\u2026",
      "\u5149\u6ED1\u7684\u6811\u76AE\u4E0A\u6D6E\u73B0\u51FA\u5947\u5F02\u7684\u7EB9\u8DEF\uFF0C\u6392\u5217\u6574\u9F50\u5982\u540C\u67D0\u79CD\u5BC6\u7801\u3002\u5730\u9762\u7684\u843D\u53F6\u88AB\u98CE\u5377\u8D77\uFF0C\u5F62\u6210\u4E86\u4E00\u4E2A\u53C8\u4E00\u4E2A\u65CB\u6DA1\u3002\u4F60\u6CE8\u610F\u5230\u67D0\u4E9B\u6811\u5E72\u4E0A\u7684\u5E74\u8F6E\u6570\u91CF\u5F02\u5E38\u89C4\u5F8B\u3002",
      "\u8FF7\u5BAB\u7684\u901A\u9053\u4F3C\u4E4E\u5728\u4E0D\u65AD\u53D8\u5316\uFF0C\u4F46\u4ED4\u7EC6\u89C2\u5BDF\u4F1A\u53D1\u73B0\u6811\u4E0A\u7684\u53D1\u5149\u82D4\u85D3\u5F62\u6210\u4E86\u67D0\u79CD\u56FE\u6848\u3002\u7A7A\u6C14\u4E2D\u98D8\u8361\u7740\u53E4\u8001\u7684\u6728\u8D28\u9999\u6C14\uFF0C\u8FDC\u5904\u4F20\u6765\u5FAE\u5F31\u7684\u949F\u58F0\u3002"
    ],
    S3: [
      "\u5B8F\u4F1F\u7684\u77F3\u6BBF\u77D7\u7ACB\u5728\u8FF7\u96FE\u4E4B\u4E2D\uFF0C\u5DE8\u5927\u7684\u77F3\u7891\u4E0A\u523B\u6EE1\u4E86\u95EA\u70C1\u7684\u7B26\u6587\u3002\u56DE\u97F3\u5728\u7A79\u9876\u4E0B\u4E0D\u65AD\u56DE\u8361\uFF0C\u4EFF\u4F5B\u5343\u5E74\u524D\u7684\u7948\u7977\u58F0\u4ECE\u672A\u6D88\u6563\u3002\u7A7A\u6C14\u4E2D\u5F25\u6F2B\u7740\u53E4\u8001\u7684\u529B\u91CF\uFF0C\u4EE4\u4EBA\u656C\u754F\u2026\u2026",
      "\u77F3\u7891\u4E0A\u7684\u7B26\u6587\u7A81\u7136\u4EAE\u4E86\u8D77\u6765\uFF0C\u6392\u5217\u7EC4\u5408\u4F3C\u4E4E\u8574\u542B\u7740\u67D0\u79CD\u89C4\u5F8B\u3002\u795E\u6BBF\u6DF1\u5904\u4F20\u6765\u6C89\u91CD\u7684\u673A\u5173\u58F0\uFF0C\u5899\u58C1\u4E0A\u7684\u6D6E\u96D5\u63CF\u7ED8\u7740\u4E00\u4E2A\u8FDC\u53E4\u6587\u660E\u7684\u6545\u4E8B\u3002",
      "\u796D\u575B\u4E0A\u6446\u653E\u7740\u4E00\u5757\u7834\u635F\u7684\u77F3\u677F\uFF0C\u4E0A\u9762\u7684\u6587\u5B57\u90E8\u5206\u5DF2\u88AB\u78E8\u635F\u3002\u56DB\u5468\u7684\u77F3\u67F1\u4E0A\u5404\u523B\u7740\u4E0D\u540C\u7684\u7B26\u53F7\uFF0C\u4EFF\u4F5B\u5728\u7B49\u5F85\u6B63\u786E\u7684\u987A\u5E8F\u88AB\u6FC0\u6D3B\u3002"
    ],
    S4: [
      "\u6F2B\u5929\u7684\u8424\u706B\u866B\u7EC7\u6210\u4E00\u7247\u5149\u4E4B\u6D77\u6D0B\uFF0C\u6EAA\u6C34\u5728\u6708\u5149\u4E0B\u6F7A\u6F7A\u6D41\u6DCC\u3002\u82B1\u4E1B\u4E2D\u9690\u85CF\u7740\u65E0\u6570\u79D8\u5BC6\uFF0C\u770B\u4F3C\u5B81\u9759\u7684\u5C71\u8C37\u4E2D\u6697\u85CF\u7384\u673A\u3002\u8424\u5149\u7684\u95EA\u70C1\u9891\u7387\u4F3C\u4E4E\u8574\u542B\u7740\u67D0\u79CD\u4FE1\u606F\u2026\u2026",
      "\u8424\u706B\u866B\u4EEC\u4EE5\u7279\u5B9A\u7684\u8282\u594F\u95EA\u70C1\uFF0C\u4EFF\u4F5B\u5728\u4F20\u9012\u67D0\u79CD\u53E4\u8001\u7684\u8BAF\u53F7\u3002\u6EAA\u6D41\u4E2D\u7684\u9E45\u5375\u77F3\u4E0A\u523B\u7740\u5947\u602A\u7684\u7B26\u53F7\uFF0C\u4E0E\u5165\u53E3\u5904\u7684\u56FE\u6848\u9065\u76F8\u547C\u5E94\u3002",
      "\u4E00\u7FA4\u8424\u706B\u866B\u56F4\u7ED5\u7740\u4E00\u6735\u591C\u767E\u5408\u7F13\u7F13\u98DE\u821E\uFF0C\u5B83\u4EEC\u7684\u95EA\u70C1\u6A21\u5F0F\u4E0E\u82B1\u74E3\u4E0A\u7684\u7EB9\u8DEF\u4EA7\u751F\u4E86\u5947\u5999\u7684\u5BF9\u5E94\u3002\u8FDC\u5904\u4F20\u6765\u60A6\u8033\u7684\u98CE\u94C3\u58F0\u3002"
    ],
    S5: [
      "\u7A7A\u95F4\u5728\u8FD9\u91CC\u626D\u66F2\u53D8\u5F62\uFF0C\u5F71\u5B50\u4E0D\u518D\u670D\u4ECE\u5149\u7EBF\u7684\u6307\u6325\u3002\u4F4E\u6C89\u7684\u5462\u5583\u58F0\u4ECE\u56DB\u9762\u516B\u65B9\u4F20\u6765\uFF0C\u65F6\u95F4\u4F3C\u4E4E\u5728\u8FD9\u91CC\u5931\u53BB\u4E86\u610F\u4E49\u3002\u88C2\u9699\u4E2D\u6D8C\u51FA\u7684\u6697\u80FD\u91CF\u6B63\u5728\u903C\u8FD1\uFF0C\u4F60\u5FC5\u987B\u8FC5\u901F\u505A\u51FA\u6289\u62E9\u2026\u2026",
      "\u4E09\u4E2A\u5F71\u5B50\u4ECE\u88C2\u9699\u4E2D\u6D8C\u51FA\uFF0C\u5411\u4E0D\u540C\u65B9\u5411\u8513\u5EF6\u3002\u5B83\u4EEC\u7684\u79FB\u52A8\u901F\u5EA6\u8D8A\u6765\u8D8A\u5FEB\uFF0C\u4F60\u53EA\u6709\u6709\u9650\u7684\u65F6\u95F4\u6765\u5C01\u9501\u5B83\u4EEC\u3002\u5899\u4E0A\u7684\u88C2\u7F1D\u6B63\u5728\u6269\u5927\uFF0C\u505A\u51FA\u51B3\u5B9A\u5427\uFF01",
      "\u6697\u5F71\u5728\u8EAB\u540E\u6C47\u805A\u6210\u5F62\uFF0C\u524D\u65B9\u7684\u8DEF\u5206\u6210\u4E24\u6761\u3002\u5DE6\u8FB9\u7684\u901A\u9053\u53D1\u51FA\u5FAE\u5F31\u7684\u5149\uFF0C\u53F3\u8FB9\u7684\u901A\u9053\u4F20\u6765\u91D1\u5C5E\u78B0\u649E\u58F0\u3002\u5F71\u5B50\u8D8A\u6765\u8D8A\u8FD1\u4E86\u2026\u2026"
    ]
  };
  var NarratorAgent = class extends BaseAgent {
    constructor(context) {
      super("narrator", context);
    }
    async handleMessage(msg) {
      switch (msg.action) {
        case "render_scene":
          return this.handleRenderScene(msg);
        case "render_ending":
          return this.handleRenderEnding(msg);
        default:
          return this.buildResponse(msg, {
            success: false,
            error: { code: "UNSUPPORTED_ACTION", message: `Narrator does not handle ${msg.action}` }
          });
      }
    }
    handleRenderScene(msg) {
      const payload = msg.payload;
      const scene = getScene(payload.scene_id);
      if (!scene) {
        return this.buildResponse(msg, { success: false, error: { code: "SCENE_NOT_FOUND", message: `Scene ${payload.scene_id} not found` } });
      }
      const descriptions = SCENE_DESCRIPTIONS[scene.id] ?? SCENE_DESCRIPTIONS["S1"];
      const variantIdx = Math.floor(Math.random() * descriptions.length);
      const description = descriptions[variantIdx];
      const header = payload.trigger === "enter" ? `
\u3010${scene.name}\u3011
` : "";
      return this.buildResponse(msg, {
        success: true,
        display_text: `${header}${description}`,
        data: { scene_id: scene.id, scene_name: scene.name }
      });
    }
    handleRenderEnding(msg) {
      const payload = msg.payload;
      let text;
      switch (payload.ending_type) {
        case "victory":
          text = "\u8FF7\u96FE\u7F13\u7F13\u6563\u53BB\uFF0C\u9633\u5149\u7A7F\u900F\u6811\u51A0\u6D12\u843D\u3002\u4E94\u679A\u5370\u8BB0\u5728\u4F60\u638C\u5FC3\u6C47\u805A\u6210\u4E00\u9053\u5149\u67F1\uFF0C\u76F4\u51B2\u5929\u9645\u3002\u68EE\u6797\u4E2D\u7684\u4E00\u5207\u751F\u7075\u4EFF\u4F5B\u5728\u4E3A\u4F60\u6B22\u547C\u2014\u2014\u4F60\u6210\u529F\u89E3\u5F00\u4E86\u8FF7\u96FE\u68EE\u6797\u6240\u6709\u7684\u8C1C\u9898\uFF0C\u627E\u5230\u4E86\u901A\u5F80\u81EA\u7531\u7684\u9053\u8DEF\uFF01\n\n\u{1F389} \u606D\u559C\u901A\u5173\uFF01";
          break;
        case "perfect":
          text = "\u8FF7\u96FE\u6D88\u6563\u7684\u90A3\u4E00\u523B\uFF0C\u6574\u7247\u68EE\u6797\u5316\u4F5C\u4E86\u91D1\u8272\u3002\u4E94\u679A\u5370\u8BB0\u6CA1\u6709\u6C47\u805A\u2014\u2014\u5B83\u4EEC\u5316\u4F5C\u4E86\u4E00\u9876\u7531\u5149\u7F16\u7EC7\u7684\u738B\u51A0\uFF0C\u60AC\u6D6E\u5728\u4F60\u5934\u9876\u3002\u4F60\u4E0D\u4EC5\u5F81\u670D\u4E86\u8FF7\u96FE\u68EE\u6797\uFF0C\u4F60\u4EE5\u5B8C\u7F8E\u65E0\u7455\u7684\u59FF\u6001\u5F81\u670D\u4E86\u5B83\u3002\u4F20\u8BF4\u4E2D\u7684\u300C\u68EE\u6797\u4E4B\u5FC3\u300D\u8BA4\u53EF\u4E86\u4F60\u2026\u2026\n\n\u{1F451} \u5B8C\u7F8E\u901A\u5173\uFF01\u5168\u7A0B\u672A\u53D7\u4F24\uFF01";
          break;
        case "defeated":
          text = "\u4F60\u7684\u89C6\u7EBF\u9010\u6E10\u6A21\u7CCA\uFF0C\u8FF7\u96FE\u541E\u566C\u4E86\u6700\u540E\u4E00\u4E1D\u5149\u4EAE\u3002\u68EE\u6797\u7684\u4F4E\u8BED\u53D8\u6210\u4E86\u5B89\u9B42\u66F2\uFF0C\u4F60\u611F\u5230\u8EAB\u4F53\u8D8A\u6765\u8D8A\u6C89\u91CD\u2026\u2026\u610F\u8BC6\u6D88\u6563\u524D\uFF0C\u4F60\u4F3C\u4E4E\u542C\u5230\u8FDC\u5904\u6709\u4EBA\u5728\u547C\u5524\u4F60\u7684\u540D\u5B57\u3002\n\n\u{1F480} \u6E38\u620F\u7ED3\u675F\u2014\u2014\u751F\u547D\u503C\u5DF2\u8017\u5C3D\u3002";
          break;
      }
      if (payload.stats) {
        const stats = payload.stats;
        text += `

\u{1F4CA} \u672C\u5C40\u7EDF\u8BA1\uFF1A
- \u6536\u96C6\u5370\u8BB0\uFF1A${stats.marks ?? 0}/5
- \u603B\u5C1D\u8BD5\u6B21\u6570\uFF1A${stats.attempts ?? 0}
- \u5269\u4F59 HP\uFF1A${stats.hp ?? 0}`;
      }
      return this.buildResponse(msg, { success: true, display_text: text });
    }
  };

  // src/agents/puzzle-master/index.ts
  var PUZZLE_LIBRARY = [
    // S1 - 逻辑推理
    {
      id: "S1_V1",
      scene_id: "S1",
      question: '\u6CBC\u6CFD\u4E2D\u6709\u4E09\u6761\u8DEF\uFF0C\u5206\u522B\u7ACB\u7740\u77F3\u7891\uFF1A\u7B2C\u4E00\u5757\u5199"\u6B64\u8DEF\u5B89\u5168"\uFF0C\u7B2C\u4E8C\u5757\u5199"\u4E09\u6761\u8DEF\u4E2D\u53EA\u6709\u4E00\u5757\u77F3\u7891\u8BF4\u4E86\u771F\u8BDD"\uFF0C\u7B2C\u4E09\u5757\u5199"\u7B2C\u4E00\u6761\u8DEF\u5371\u9669"\u3002\u53EA\u6709\u4E00\u6761\u8DEF\u662F\u5B89\u5168\u7684\uFF0C\u54EA\u6761\u8DEF\uFF1F',
      answer: "3",
      accept_patterns: [/^3$/, /第三/, /三号/, /右/],
      hints: ["\u6CE8\u610F\uFF1A\u5982\u679C\u7B2C\u4E00\u5757\u77F3\u7891\u8BF4\u771F\u8BDD\uFF0C\u770B\u770B\u662F\u5426\u77DB\u76FE", "\u7B2C\u4E8C\u5757\u77F3\u7891\u662F\u5173\u952E\u2014\u2014\u5982\u679C\u5B83\u4E3A\u771F\uFF0C\u5176\u4ED6\u4E24\u5757\u90FD\u4E3A\u5047", "\u7B2C\u4E8C\u5757\u4E3A\u771F \u2192 \u7B2C\u4E00\u5757\u4E3A\u5047\uFF08\u6B64\u8DEF\u4E0D\u5B89\u5168\uFF09\u2192 \u7B2C\u4E09\u5757\u4E3A\u5047\uFF1F\u4E0D\u5BF9\u3002\u518D\u60F3\u60F3\uFF1A\u7B2C\u4E8C\u5757\u4E3A\u771F \u2192 \u53EA\u6709\u5B83\u4E3A\u771F \u2192 \u7B2C\u4E00\u5757\u5047 \u2192 \u7B2C\u4E00\u6761\u8DEF\u4E0D\u5B89\u5168\uFF0C\u7B2C\u4E09\u5757\u4E5F\u5047\uFF1F\u4F46\u7B2C\u4E09\u5757\u8BF4\u7B2C\u4E00\u6761\u8DEF\u5371\u9669\uFF0C\u8FD9\u4E0E\u7B2C\u4E00\u5757\u5047\u4E00\u81F4\u2026\u2026\u6240\u4EE5\u7B2C\u4E09\u6761\u8DEF\u5B89\u5168"]
    },
    {
      id: "S1_V2",
      scene_id: "S1",
      question: '\u6CBC\u6CFD\u4E2D\u592E\u6709\u4E00\u5EA7\u65AD\u6865\uFF0C\u6865\u4E0A\u5199\u7740\uFF1A"\u53EA\u6709\u8BF4\u51FA\u6211\u7684\u540D\u5B57\u624D\u80FD\u901A\u8FC7"\u3002\u6865\u7684\u4E24\u4FA7\u5404\u523B\u7740\u4E00\u4E2A\u5B57\u2014\u2014\u5DE6\u8FB9\u662F"\u65AD"\uFF0C\u53F3\u8FB9\u662F"\u6865"\u3002\u4F60\u8BE5\u8BF4\u4EC0\u4E48\uFF1F',
      answer: "\u65AD\u6865",
      accept_patterns: [/断桥/],
      hints: ["\u7B54\u6848\u5C31\u5728\u773C\u524D\uFF0C\u4E0D\u9700\u8981\u60F3\u592A\u590D\u6742", '\u770B\u770B\u6865\u4E0A\u5199\u4E86\u4EC0\u4E48\u2014\u2014"\u8BF4\u51FA\u6211\u7684\u540D\u5B57"', "\u6865\u7684\u540D\u5B57\u5C31\u662F\u4E24\u8FB9\u523B\u7684\u5B57\u7EC4\u5408\u8D77\u6765"]
    },
    {
      id: "S1_V3",
      scene_id: "S1",
      question: '\u4E09\u53EA\u9752\u86D9\u5750\u5728\u4E09\u7247\u8377\u53F6\u4E0A\u3002\u7B2C\u4E00\u53EA\u8BF4\uFF1A"\u6211\u53F3\u8FB9\u7684\u5728\u8BF4\u8C0E"\u3002\u7B2C\u4E8C\u53EA\u8BF4\uFF1A"\u6211\u4EEC\u4E09\u4E2A\u90FD\u5728\u8BF4\u8C0E"\u3002\u7B2C\u4E09\u53EA\u8BF4\uFF1A"\u524D\u4E24\u53EA\u81F3\u5C11\u6709\u4E00\u53EA\u5728\u8BF4\u771F\u8BDD"\u3002\u8C01\u5728\u8BF4\u771F\u8BDD\uFF1F',
      answer: "\u7B2C\u4E00\u53EA\u548C\u7B2C\u4E09\u53EA",
      accept_patterns: [/1.*3/, /第一.*第三/, /一.*三/],
      hints: ["\u5982\u679C\u7B2C\u4E8C\u53EA\u8BF4\u771F\u8BDD\uFF08\u4E09\u4E2A\u90FD\u8BF4\u8C0E\uFF09\uFF0C\u90A3\u5B83\u81EA\u5DF1\u4E5F\u5728\u8BF4\u8C0E\u2014\u2014\u77DB\u76FE", '\u6240\u4EE5\u7B2C\u4E8C\u53EA\u4E00\u5B9A\u5728\u8BF4\u8C0E\u3002\u90A3\u4E48\u7B2C\u4E09\u53EA\u8BF4\u7684"\u524D\u4E24\u53EA\u81F3\u5C11\u6709\u4E00\u53EA\u8BF4\u771F\u8BDD"\u5462\uFF1F', "\u7B2C\u4E8C\u53EA\u8BF4\u8C0E \u2192 \u4E0D\u662F\u4E09\u4E2A\u90FD\u8BF4\u8C0E \u2192 \u81F3\u5C11\u6709\u4E00\u4E2A\u8BF4\u771F\u8BDD\u3002\u7B2C\u4E09\u53EA\u7684\u8BDD\u6210\u7ACB\u3002\u7B2C\u4E00\u53EA\u8BF4\u7B2C\u4E8C\u53EA\u8BF4\u8C0E\uFF0C\u4E5F\u662F\u771F\u7684"]
    },
    // S2 - 规律识别
    {
      id: "S2_V1",
      scene_id: "S2",
      question: "\u53E4\u6811\u4E0A\u523B\u7740\u4E00\u7EC4\u6570\u5B57\uFF1A2, 6, 12, 20, 30, ?\u3002\u4E0B\u4E00\u4E2A\u6570\u5B57\u662F\u4EC0\u4E48\uFF1F",
      answer: "42",
      accept_patterns: [/^42$/],
      hints: ["\u89C2\u5BDF\u76F8\u90BB\u6570\u5B57\u7684\u5DEE\u503C\uFF1A4, 6, 8, 10...", "\u5DEE\u503C\u672C\u8EAB\u6784\u6210\u4E86\u4E00\u4E2A\u7B49\u5DEE\u6570\u5217\uFF0C\u516C\u5DEE\u4E3A2", "\u4E0B\u4E00\u4E2A\u5DEE\u503C\u662F12\uFF0C\u6240\u4EE5\u7B54\u6848\u662F 30 + 12 = 42"]
    },
    {
      id: "S2_V2",
      scene_id: "S2",
      question: "\u53D1\u5149\u82D4\u85D3\u6392\u5217\u51FA\u56FE\u6848\uFF1A\u{1F7E2}\u26AB\u{1F7E2}\u{1F7E2}\u26AB\u{1F7E2}\u{1F7E2}\u{1F7E2}\u26AB\uFF1F\uFF1F\uFF1F\u26AB\u3002\u95EE\u53F7\u5904\u5E94\u8BE5\u662F\u4EC0\u4E48\uFF1F",
      answer: "\u{1F7E2}\u{1F7E2}\u{1F7E2}\u{1F7E2}",
      accept_patterns: [/4|四|绿{4}|🟢{4}/],
      hints: ["\u6570\u4E00\u6570\u6BCF\u7EC4\u7EFF\u5149\u7684\u6570\u91CF", "\u89C4\u5F8B\u662F\uFF1A1\u4E2A, 2\u4E2A, 3\u4E2A...", "\u4E0B\u4E00\u7EC4\u5E94\u8BE5\u662F4\u4E2A\u7EFF\u5149"]
    },
    {
      id: "S2_V3",
      scene_id: "S2",
      question: "\u6811\u5E72\u5E74\u8F6E\u6570\u4ECE\u5916\u5230\u5185\u4F9D\u6B21\u4E3A\uFF1A1, 1, 2, 3, 5, 8, ?\u3002\u4E0B\u4E00\u4E2A\u662F\u4EC0\u4E48\uFF1F",
      answer: "13",
      accept_patterns: [/^13$/],
      hints: ["\u8FD9\u662F\u4E00\u4E2A\u7ECF\u5178\u7684\u6570\u5B66\u5E8F\u5217", "\u6BCF\u4E2A\u6570\u5B57\u7B49\u4E8E\u524D\u4E24\u4E2A\u6570\u5B57\u4E4B\u548C", "5 + 8 = 13"]
    },
    // S3 - 密码解读
    {
      id: "S3_V1",
      scene_id: "S3",
      question: '\u77F3\u7891\u4E0A\u523B\u7740\u5BC6\u6587"GFNF TFDSFU"\uFF0C\u65C1\u8FB9\u6CE8\u91CA"\u6BCF\u4E2A\u5B57\u6BCD\u90FD\u5411\u540E\u79FB\u52A8\u4E86\u4E00\u6B65"\u3002\u539F\u6587\u662F\u4EC0\u4E48\uFF1F',
      answer: "FEME SECRET",
      accept_patterns: [/FEME.?SECRET/i],
      hints: ["\u5C06\u6BCF\u4E2A\u5B57\u6BCD\u5411\u524D\u79FB\u52A8\u4E00\u4F4D", "G\u2192F, F\u2192E, N\u2192M, F\u2192E...", "\u5B8C\u6574\u89E3\u5BC6\uFF1AFEME SECRET"]
    },
    {
      id: "S3_V2",
      scene_id: "S3",
      question: "\u795E\u6BBF\u5730\u9762\u4E0A\u6709\u4E94\u4E2A\u7B26\u6587\uFF0C\u5206\u522B\u4EE3\u8868\u6570\u5B57\u3002\u5DF2\u77E5\uFF1A\u25B3=1, \u25A1=2, \u25CB=3\u3002\u6C42\uFF1A\u25B3\u25A1\u25CB + \u25CB\u25A1\u25B3 = ?",
      answer: "456",
      accept_patterns: [/^456$/],
      hints: ["\u628A\u7B26\u53F7\u66FF\u6362\u6210\u5BF9\u5E94\u7684\u6570\u5B57\uFF0C\u7EC4\u6210\u4E09\u4F4D\u6570", "\u25B3\u25A1\u25CB = 123, \u25CB\u25A1\u25B3 = 321", "123 + 321 = 444... \u7B49\u7B49\uFF0C\u518D\u60F3\u60F3\u2014\u2014\u8FD9\u91CC\u662F\u628A\u7B26\u53F7\u76F4\u63A5\u66FF\u6362\u540E\u62FC\u63A5\u8BA1\u7B97"]
    },
    {
      id: "S3_V3",
      scene_id: "S3",
      question: '\u5899\u58C1\u4E0A\u5199\u7740"HELLO"\u7684\u955C\u50CF\u6587\u5B57\uFF08\u4ECE\u53F3\u5230\u5DE6\uFF09\u3002\u5982\u679C\u7528\u540C\u6837\u7684\u89C4\u5219\u89E3\u8BFB"DLROW"\uFF0C\u539F\u6587\u662F\u4EC0\u4E48\uFF1F',
      answer: "WORLD",
      accept_patterns: [/^WORLD$/i],
      hints: ["\u955C\u50CF\u5C31\u662F\u628A\u5B57\u7B26\u4E32\u53CD\u8F6C", "\u8BD5\u7740\u4ECE\u53F3\u5230\u5DE6\u8BFB\u8FD9\u4E9B\u5B57\u6BCD", "D-L-R-O-W \u53CD\u8F6C\u4E3A W-O-R-L-D"]
    },
    // S4 - 观察联想
    {
      id: "S4_V1",
      scene_id: "S4",
      question: "7\u53EA\u8424\u706B\u866B\u4EE5\u7279\u5B9A\u8282\u594F\u95EA\u70C1\uFF1A\u4EAE-\u4EAE-\u706D-\u4EAE-\u706D-\u4EAE-\u4EAE\u3002\u5165\u53E3\u5904\u6709\u56DB\u4E2A\u7B26\u53F7\u2014\u2014(A) \u25AA\u25AA\u25AB\u25AA\u25AB\u25AA\u25AA (B) \u25AA\u25AB\u25AA\u25AB\u25AA\u25AA\u25AA (C) \u25AA\u25AA\u25AA\u25AB\u25AA\u25AB\u25AA (D) \u25AA\u25AB\u25AA\u25AA\u25AB\u25AA\u25AA\u3002\u54EA\u4E2A\u7B26\u53F7\u4E0E\u8424\u706B\u866B\u7684\u95EA\u70C1\u4E00\u81F4\uFF1F",
      answer: "A",
      accept_patterns: [/^[Aa]$/],
      hints: ['\u5C06"\u4EAE"\u5BF9\u5E94"\u25AA"\uFF0C"\u706D"\u5BF9\u5E94"\u25AB"', "\u8424\u706B\u866B\uFF1A\u4EAE\u4EAE\u706D\u4EAE\u706D\u4EAE\u4EAE \u2192 \u25AA\u25AA\u25AB\u25AA\u25AB\u25AA\u25AA", "\u9010\u4E00\u6BD4\u5BF9\u56DB\u4E2A\u9009\u9879\u7684\u7B2C3\u548C\u7B2C5\u4E2A\u4F4D\u7F6E\u662F\u5426\u4E3A\u25AB"]
    },
    {
      id: "S4_V2",
      scene_id: "S4",
      question: '\u6EAA\u6D41\u4E2D\u67095\u5757\u9E45\u5375\u77F3\uFF0C\u4E0A\u9762\u5206\u522B\u523B\u7740\uFF1A\u65E5\u3001\u6708\u3001\u661F\u3001\u8FB0\u3001?\u3002\u65C1\u8FB9\u7684\u82B1\u74E3\u4E0A\u5199\u7740"\u5929\u4E0A\u4E4B\u7269"\u3002\u7B2C\u4E94\u5757\u77F3\u5934\u5E94\u8BE5\u662F\u4EC0\u4E48\uFF1F',
      answer: "\u4E91",
      accept_patterns: [/^云$/],
      hints: ["\u524D\u56DB\u4E2A\u90FD\u662F\u5929\u4E0A\u53EF\u89C1\u7684\u4E8B\u7269", '"\u65E5\u6708\u661F\u8FB0"\u662F\u4E00\u4E2A\u5E38\u89C1\u7684\u56DB\u5B57\u7EC4\u5408\uFF0C\u7B2C\u4E94\u4E2A\u8981\u6269\u5C55', '\u5929\u4E0A\u4E4B\u7269\u8FD8\u6709\u4EC0\u4E48\uFF1F\u98CE\u3001\u96E8\u3001\u4E91\u2026\u2026\u5176\u4E2D"\u4E91"\u6700\u5E38\u4E0E\u524D\u56DB\u8005\u5E76\u5217']
    },
    {
      id: "S4_V3",
      scene_id: "S4",
      question: "\u4E09\u6735\u82B1\u5206\u522B\u5728\u4E0D\u540C\u65F6\u95F4\u7EFD\u653E\uFF1A\u7B2C\u4E00\u6735\u5728\u6709\u6708\u5149\u65F6\u5F00\u653E\uFF0C\u7B2C\u4E8C\u6735\u5728\u6EAA\u6C34\u58F0\u6700\u5927\u65F6\u5F00\u653E\uFF0C\u7B2C\u4E09\u6735\u5728\u8424\u706B\u866B\u6700\u591A\u65F6\u5F00\u653E\u3002\u73B0\u5728\u6708\u4EAE\u88AB\u4E91\u906E\u4F4F\uFF0C\u6EAA\u6C34\u5E73\u7F13\uFF0C\u4F46\u8424\u706B\u866B\u6F2B\u5929\u98DE\u821E\u3002\u54EA\u6735\u82B1\u6B63\u5728\u7EFD\u653E\uFF1F",
      answer: "\u7B2C\u4E09\u6735",
      accept_patterns: [/3|三|第三/],
      hints: ["\u5206\u6790\u5F53\u524D\u7684\u73AF\u5883\u6761\u4EF6", "\u6708\u4EAE\u88AB\u906E\u4F4F \u2192 \u7B2C\u4E00\u6735\u4E0D\u5F00\uFF1B\u6EAA\u6C34\u5E73\u7F13 \u2192 \u7B2C\u4E8C\u6735\u4E0D\u5F00", "\u8424\u706B\u866B\u6F2B\u5929\u98DE\u821E \u2192 \u8424\u706B\u866B\u6700\u591A \u2192 \u7B2C\u4E09\u6735\u7EFD\u653E"]
    },
    // S5 - 限时决策
    {
      id: "S5_V1",
      scene_id: "S5",
      question: "\u4E09\u9053\u5F71\u5B50\u5206\u522B\u4ECE\u5DE6\u3001\u4E2D\u3001\u53F3\u903C\u8FD1\u3002\u4F60\u53EA\u6709\u4E24\u6B21\u5C01\u9501\u673A\u4F1A\u3002\u5DF2\u77E5\uFF1A\u4E2D\u95F4\u7684\u5F71\u5B50\u901F\u5EA6\u6700\u5FEB\uFF0C\u5DE6\u8FB9\u7684\u5F71\u5B50\u4E00\u65E6\u5230\u8FBE\u4F1A\u53EC\u5524\u66F4\u591A\u5F71\u5B50\u3002\u4F60\u5E94\u8BE5\u5148\u5C01\u54EA\u4E24\u4E2A\u65B9\u5411\uFF1F",
      answer: "\u5DE6\u548C\u4E2D",
      accept_patterns: [/左.*中|中.*左/],
      hints: ["\u8003\u8651\u4E0D\u5C01\u9501\u6BCF\u4E2A\u65B9\u5411\u7684\u540E\u679C", "\u4E2D\u95F4\u6700\u5FEB\u4F1A\u5148\u5230\u2014\u2014\u5FC5\u987B\u5C01\uFF1B\u5DE6\u8FB9\u4F1A\u53EC\u5524\u66F4\u591A\u2014\u2014\u5FC5\u987B\u5C01", "\u4F18\u5148\u5C01\u9501\u5DE6\uFF08\u963B\u6B62\u53EC\u5524\uFF09\u548C\u4E2D\uFF08\u963B\u6B62\u6700\u5FEB\u5230\u8FBE\uFF09\uFF0C\u53F3\u8FB9\u7684\u5F71\u5B50\u901F\u5EA6\u6162\u53EF\u4EE5\u8EB2\u907F"]
    },
    {
      id: "S5_V2",
      scene_id: "S5",
      question: '\u88C2\u9699\u6B63\u5728\u6269\u5927\uFF0C\u4F60\u6709\u4E09\u4E2A\u9009\u62E9\uFF1A(A) \u7528\u77F3\u5934\u5835\u4F4F\u88C2\u9699 (B) \u4ECE\u88C2\u9699\u4E2D\u62C9\u51FA\u5149\u7EBF (C) \u8DF3\u8FC7\u88C2\u9699\u9003\u8DD1\u3002\u4F46\u662F\uFF1A\u77F3\u5934\u53EF\u80FD\u788E\u88C2\uFF0C\u5149\u7EBF\u53EF\u80FD\u662F\u9677\u9631\uFF0C\u9003\u8DD1\u5219\u653E\u5F03\u5370\u8BB0\u3002\u5899\u4E0A\u7684\u7EBF\u7D22\u5199\u7740"\u9ED1\u6697\u4E2D\u552F\u6709\u5149\u660E\u53EF\u4EE5\u5BF9\u6297\u9ED1\u6697"\u3002\u4F60\u9009\u54EA\u4E2A\uFF1F',
      answer: "B",
      accept_patterns: [/^[Bb]$|光线|拉.*光/],
      hints: ["\u6CE8\u610F\u5899\u4E0A\u7684\u7EBF\u7D22", '"\u552F\u6709\u5149\u660E\u53EF\u4EE5\u5BF9\u6297\u9ED1\u6697"\u2014\u2014\u6697\u793A\u4E86\u6B63\u786E\u7684\u65B9\u6CD5', "\u4ECE\u88C2\u9699\u4E2D\u62C9\u51FA\u5149\u7EBF\uFF0C\u7528\u5149\u660E\u5BF9\u6297\u6697\u5F71\u88C2\u9699"]
    },
    {
      id: "S5_V3",
      scene_id: "S5",
      question: '\u4F60\u9762\u524D\u6709\u4E24\u6247\u95E8\uFF1A\u5DE6\u95E8\u53D1\u51FA\u5FAE\u5F31\u767D\u5149\uFF0C\u53F3\u95E8\u4F20\u6765\u91D1\u5C5E\u78B0\u649E\u58F0\u3002\u5F71\u5B50\u4ECE\u8EAB\u540E\u903C\u8FD1\uFF0C\u4F60\u53EA\u6709\u9009\u62E9\u4E00\u6247\u95E8\u7684\u65F6\u95F4\u3002\u5730\u4E0A\u5199\u7740\uFF1A"\u58F0\u97F3\u662F\u56DE\u5FC6\uFF0C\u5149\u662F\u672A\u6765"\u3002\u4F60\u9009\u54EA\u6247\u95E8\uFF1F',
      answer: "\u5DE6",
      accept_patterns: [/左|白光|光/],
      hints: ["\u6CE8\u610F\u5730\u4E0A\u7684\u6587\u5B57\u63D0\u793A", '"\u58F0\u97F3\u662F\u56DE\u5FC6"\u2014\u2014\u56DE\u5FC6\u5C5E\u4E8E\u8FC7\u53BB\uFF1B"\u5149\u662F\u672A\u6765"\u2014\u2014\u672A\u6765\u662F\u524D\u8FDB\u65B9\u5411', '\u9009\u62E9\u4EE3\u8868"\u672A\u6765"\u7684\u5149\u4E4B\u95E8\uFF08\u5DE6\u95E8\uFF09']
    }
  ];
  var PuzzleMasterAgent = class extends BaseAgent {
    constructor(context) {
      super("puzzle_master", context);
      this.currentPuzzle = null;
    }
    async handleMessage(msg) {
      switch (msg.action) {
        case "generate_puzzle":
          return this.handleGeneratePuzzle(msg);
        case "validate_answer":
          return this.handleValidateAnswer(msg);
        case "request_hint":
          return this.handleRequestHint(msg);
        default:
          return this.buildResponse(msg, {
            success: false,
            error: { code: "UNSUPPORTED_ACTION", message: `PuzzleMaster does not handle ${msg.action}` }
          });
      }
    }
    handleGeneratePuzzle(msg) {
      const payload = msg.payload;
      const puzzles = PUZZLE_LIBRARY.filter((p) => p.scene_id === payload.scene_id);
      if (puzzles.length === 0) {
        return this.buildResponse(msg, { success: false, error: { code: "NO_PUZZLES", message: `No puzzles for scene ${payload.scene_id}` } });
      }
      const idx = payload.variant_index % puzzles.length;
      this.currentPuzzle = puzzles[idx];
      return this.buildResponse(msg, {
        success: true,
        display_text: `
\u{1F9E9} \u8C1C\u9898\uFF1A
${this.currentPuzzle.question}

\uFF08\u8F93\u5165"\u63D0\u793A"\u83B7\u53D6\u63D0\u793A\uFF0C\u8F93\u5165"\u653E\u5F03"\u8DF3\u8FC7\u6B64\u9898\uFF09`,
        data: { puzzle_id: this.currentPuzzle.id, scene_id: this.currentPuzzle.scene_id }
      });
    }
    handleValidateAnswer(msg) {
      const payload = msg.payload;
      if (msg.payload.force_skip) {
        const sideEffects2 = [
          { field: "hp", op: "subtract", value: HP.WRONG_THIRD, reason: "\u653E\u5F03\u8C1C\u9898" },
          { field: "current_attempt", op: "set", value: 0, reason: "\u91CD\u7F6E\u5C1D\u8BD5\u6B21\u6570" },
          { field: "hints_used_current", op: "set", value: 0, reason: "\u91CD\u7F6E\u63D0\u793A" },
          { field: "consecutive_correct", op: "set", value: 0, reason: "\u653E\u5F03\u6253\u65AD\u8FDE\u7EED\u6B63\u786E" }
        ];
        this.currentPuzzle = null;
        return this.buildResponse(msg, {
          success: true,
          display_text: "\u4F60\u9009\u62E9\u4E86\u653E\u5F03\u8FD9\u9053\u8C1C\u9898\u3002\u8FF7\u96FE\u4FB5\u8680\u4E86\u4F60\u7684\u751F\u547D\u529B\u2026\u2026\uFF08-20 HP\uFF09",
          data: { correct: false, skipped: true },
          side_effects: sideEffects2
        });
      }
      if (!this.currentPuzzle) {
        return this.buildResponse(msg, { success: false, error: { code: "NO_ACTIVE_PUZZLE", message: "No active puzzle" } });
      }
      const isCorrect = this.currentPuzzle.accept_patterns.some((p) => p.test(payload.player_answer.trim()));
      const sideEffects = [];
      if (isCorrect) {
        const hpGain = payload.hints_used > 0 ? HP.CORRECT_WITH_HINT : HP.CORRECT_FIRST;
        sideEffects.push(
          { field: "hp", op: "add", value: hpGain, reason: "\u7B54\u9898\u6B63\u786E" },
          { field: "marks", op: "push", value: this.currentPuzzle.scene_id, reason: "\u83B7\u5F97\u573A\u666F\u5370\u8BB0" },
          { field: "scenes_completed", op: "push", value: this.currentPuzzle.scene_id, reason: "\u573A\u666F\u5B8C\u6210" },
          { field: "consecutive_correct", op: "add", value: 1, reason: "\u8FDE\u7EED\u6B63\u786E+1" },
          { field: "current_attempt", op: "set", value: 0, reason: "\u91CD\u7F6E" },
          { field: "hints_used_current", op: "set", value: 0, reason: "\u91CD\u7F6E" }
        );
        if (Math.random() < GAME.ITEM_DROP_CHANCE) {
          sideEffects.push({ field: "items", op: "push", value: "\u751F\u547D\u9732\u73E0", reason: "\u7B54\u9898\u6B63\u786E\u6389\u843D" });
        }
        const text = `\u2705 \u56DE\u7B54\u6B63\u786E\uFF01${payload.hints_used > 0 ? "(+5 HP)" : "(+10 HP)"}
\u4F60\u83B7\u5F97\u4E86\u3010${getScene2(this.currentPuzzle.scene_id)}\u3011\u7684\u5370\u8BB0\uFF01`;
        this.currentPuzzle = null;
        return this.buildResponse(msg, { success: true, display_text: text, data: { correct: true }, side_effects: sideEffects });
      }
      const attempt = payload.attempt_number;
      if (attempt >= GAME.MAX_ATTEMPTS_PER_PUZZLE) {
        sideEffects.push(
          { field: "hp", op: "subtract", value: HP.WRONG_THIRD, reason: "\u7B2C3\u6B21\u7B54\u9519" },
          { field: "scenes_failed", op: "push", value: this.currentPuzzle.scene_id, reason: "\u573A\u666F\u5931\u8D25" },
          { field: "current_attempt", op: "set", value: 0, reason: "\u91CD\u7F6E" },
          { field: "hints_used_current", op: "set", value: 0, reason: "\u91CD\u7F6E" },
          { field: "consecutive_correct", op: "set", value: 0, reason: "\u8FDE\u7EED\u6B63\u786E\u4E2D\u65AD" }
        );
        this.currentPuzzle = null;
        return this.buildResponse(msg, {
          success: true,
          display_text: `\u274C \u56DE\u7B54\u9519\u8BEF\uFF01\u8FD9\u662F\u7B2C\u4E09\u6B21\u5931\u8D25\uFF08-20 HP\uFF09\uFF0C\u8C1C\u9898\u5DF2\u5173\u95ED\u3002\u4F60\u672A\u80FD\u83B7\u5F97\u6B64\u573A\u666F\u7684\u5370\u8BB0\u2026\u2026`,
          data: { correct: false, failed_out: true },
          side_effects: sideEffects
        });
      }
      const hpLoss = attempt === 1 ? HP.WRONG_FIRST : HP.WRONG_SECOND;
      sideEffects.push(
        { field: "hp", op: "subtract", value: hpLoss, reason: `\u7B2C${attempt}\u6B21\u7B54\u9519` },
        { field: "current_attempt", op: "add", value: 1, reason: "\u5C1D\u8BD5\u6B21\u6570+1" },
        { field: "consecutive_correct", op: "set", value: 0, reason: "\u8FDE\u7EED\u6B63\u786E\u4E2D\u65AD" }
      );
      const remaining = GAME.MAX_ATTEMPTS_PER_PUZZLE - attempt;
      return this.buildResponse(msg, {
        success: true,
        display_text: `\u274C \u56DE\u7B54\u9519\u8BEF\uFF01(-${hpLoss} HP) \u8FD8\u6709 ${remaining} \u6B21\u673A\u4F1A\u3002`,
        data: { correct: false, attempts_remaining: remaining },
        side_effects: sideEffects
      });
    }
    handleRequestHint(msg) {
      const payload = msg.payload;
      if (!this.currentPuzzle) {
        return this.buildResponse(msg, { success: false, error: { code: "NO_ACTIVE_PUZZLE", message: "No active puzzle" } });
      }
      const level = payload.current_hint_level;
      if (level >= GAME.MAX_HINTS_PER_PUZZLE) {
        return this.buildResponse(msg, {
          success: true,
          display_text: "\u5DF2\u7ECF\u6CA1\u6709\u66F4\u591A\u63D0\u793A\u4E86\uFF0C\u8BF7\u5C1D\u8BD5\u4F5C\u7B54\u5427\u3002",
          data: { hint_available: false }
        });
      }
      const cost = HINT_COSTS[level];
      const hint = this.currentPuzzle.hints[level];
      const sideEffects = [
        { field: "hp", op: "subtract", value: cost, reason: `\u8BF7\u6C42\u63D0\u793A Level ${level + 1}` },
        { field: "hints_used_current", op: "add", value: 1, reason: "\u4F7F\u7528\u63D0\u793A" }
      ];
      return this.buildResponse(msg, {
        success: true,
        display_text: `\u{1F4A1} \u63D0\u793A ${level + 1}\uFF08-${cost} HP\uFF09\uFF1A${hint}`,
        data: { hint_level: level + 1 },
        side_effects: sideEffects
      });
    }
    getCurrentPuzzle() {
      return this.currentPuzzle;
    }
  };
  function getScene2(sceneId) {
    const names = { S1: "\u5E7D\u6697\u6CBC\u6CFD", S2: "\u53E4\u6811\u8FF7\u5BAB", S3: "\u9057\u5FD8\u795E\u6BBF", S4: "\u8424\u706B\u866B\u8C37", S5: "\u6697\u5F71\u88C2\u9699" };
    return names[sceneId] ?? sceneId;
  }

  // src/state/transitions.ts
  function applyOperation(state, op) {
    const newState = JSON.parse(JSON.stringify(state));
    switch (op.field) {
      case "hp": {
        const val = op.value;
        if (op.op === "add") newState.player.hp = Math.min(newState.player.max_hp, newState.player.hp + val);
        else if (op.op === "subtract") newState.player.hp = Math.max(0, newState.player.hp - val);
        else if (op.op === "set") newState.player.hp = Math.max(0, Math.min(newState.player.max_hp, val));
        break;
      }
      case "marks": {
        const sceneId = op.value;
        if (op.op === "push") {
          if (!newState.player.marks.some((m) => m.scene_id === sceneId)) {
            newState.player.marks.push({ scene_id: sceneId, obtained_at: Date.now() });
          }
        } else if (op.op === "remove") {
          newState.player.marks = newState.player.marks.filter((m) => m.scene_id !== sceneId);
        }
        break;
      }
      case "items": {
        if (op.op === "push") {
          if (newState.player.items.length < 3) {
            newState.player.items.push({
              id: `item_${Date.now()}`,
              name: op.value,
              effect: getItemEffect(op.value),
              obtained_at: Date.now()
            });
          }
        } else if (op.op === "remove") {
          const idx = newState.player.items.findIndex((i) => i.name === op.value);
          if (idx >= 0) newState.player.items.splice(idx, 1);
        }
        break;
      }
      case "consecutive_correct": {
        const val = op.value;
        if (op.op === "add") newState.player.consecutive_correct += val;
        else if (op.op === "set") newState.player.consecutive_correct = val;
        break;
      }
      case "total_attempts": {
        const val = op.value;
        if (op.op === "add") newState.player.total_attempts += val;
        else if (op.op === "set") newState.player.total_attempts = val;
        break;
      }
      case "game_status":
        if (op.op === "set") newState.session.game_status = op.value;
        break;
      case "current_scene":
        if (op.op === "set") newState.session.current_scene = op.value;
        break;
      case "current_puzzle_id":
        if (op.op === "set") newState.session.current_puzzle_id = op.value;
        break;
      case "scenes_completed": {
        if (op.op === "push" && !newState.session.scenes_completed.includes(op.value)) {
          newState.session.scenes_completed.push(op.value);
        }
        break;
      }
      case "scenes_failed": {
        const sceneId = op.value;
        if (op.op === "push" && !newState.session.scenes_failed.includes(sceneId)) {
          newState.session.scenes_failed.push(sceneId);
        } else if (op.op === "remove") {
          newState.session.scenes_failed = newState.session.scenes_failed.filter((s) => s !== sceneId);
        }
        break;
      }
      case "current_attempt": {
        const val = op.value;
        if (op.op === "add") newState.session.current_attempt += val;
        else if (op.op === "set") newState.session.current_attempt = val;
        break;
      }
      case "hints_used_current": {
        const val = op.value;
        if (op.op === "add") newState.session.hints_used_current += val;
        else if (op.op === "set") newState.session.hints_used_current = val;
        break;
      }
      case "turn_count": {
        const val = op.value;
        if (op.op === "add") newState.session.turn_count += val;
        else if (op.op === "set") newState.session.turn_count = val;
        break;
      }
    }
    newState.version++;
    return newState;
  }
  function getItemEffect(name) {
    if (name === "\u751F\u547D\u9732\u73E0") return "heal";
    if (name === "\u8FF7\u96FE\u706F\u7B3C") return "free_hint";
    return "extra_turn";
  }

  // src/state/initial.ts
  function createInitialState() {
    return {
      version: 0,
      player: {
        hp: 100,
        max_hp: 100,
        marks: [],
        items: [],
        consecutive_correct: 0,
        total_attempts: 0
      },
      session: {
        game_status: "active",
        current_scene: null,
        current_puzzle_id: null,
        scenes_completed: [],
        scenes_failed: [],
        current_attempt: 0,
        hints_used_current: 0,
        turn_count: 0,
        start_time: Date.now()
      }
    };
  }

  // src/agents/status-keeper/index.ts
  var StatusKeeperAgent = class extends BaseAgent {
    constructor(context) {
      super("status_keeper", context);
      this.eventLog = [];
      this.state = createInitialState();
    }
    async handleMessage(msg) {
      switch (msg.action) {
        case "modify_state":
          return this.handleModifyState(msg);
        case "query_state":
          return this.handleQueryState(msg);
        case "rollback_state":
          return this.handleRollback(msg);
        default:
          return this.buildResponse(msg, {
            success: false,
            error: { code: "UNSUPPORTED_ACTION", message: `StatusKeeper does not handle ${msg.action}` }
          });
      }
    }
    handleModifyState(msg) {
      const operations = msg.payload.operations;
      if (!operations || operations.length === 0) {
        return this.buildResponse(msg, { success: false, error: { code: "NO_OPERATIONS", message: "No operations provided" } });
      }
      const versionBefore = this.state.version;
      let newState = this.state;
      for (const op of operations) {
        newState = applyOperation(newState, op);
      }
      this.state = newState;
      this.eventLog.push({
        event_id: `evt_${Date.now()}`,
        version_before: versionBefore,
        version_after: this.state.version,
        timestamp: Date.now(),
        correlation_id: msg.correlation_id,
        operations
      });
      const sideEffects = [];
      if (this.state.player.hp <= 0) {
        sideEffects.push({ field: "game_status", op: "set", value: "defeated", reason: "HP reached 0" });
        this.state = applyOperation(this.state, sideEffects[0]);
      } else if (this.state.player.marks.length >= 5) {
        sideEffects.push({ field: "game_status", op: "set", value: "victory", reason: "Collected 5 marks" });
        this.state = applyOperation(this.state, sideEffects[0]);
      }
      return this.buildResponse(msg, {
        success: true,
        data: { state: this.state, version: this.state.version },
        side_effects: sideEffects.length > 0 ? sideEffects : void 0
      });
    }
    handleQueryState(msg) {
      return this.buildResponse(msg, {
        success: true,
        data: { state: this.state }
      });
    }
    handleRollback(msg) {
      const targetVersion = msg.payload.target_version;
      if (targetVersion < 0 || targetVersion >= this.state.version) {
        return this.buildResponse(msg, { success: false, error: { code: "INVALID_VERSION", message: "Invalid target version" } });
      }
      let rebuilt = createInitialState();
      for (const event of this.eventLog) {
        if (event.version_after > targetVersion) break;
        for (const op of event.operations) {
          rebuilt = applyOperation(rebuilt, op);
        }
      }
      this.state = rebuilt;
      return this.buildResponse(msg, { success: true, data: { state: this.state } });
    }
    getState() {
      return this.state;
    }
    resetState() {
      this.state = createInitialState();
      this.eventLog = [];
    }
  };

  // src/agents/guide/index.ts
  var TUTORIAL_TEXT = `
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
    \u{1F332} \u8FF7\u96FE\u68EE\u6797 \u2014 \u6587\u5B57\u63A2\u9669\u89E3\u8C1C \u{1F332}
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550

\u6B22\u8FCE\u6765\u5230\u8FF7\u96FE\u68EE\u6797\uFF01\u4F60\u5C06\u8E0F\u4E0A\u4E00\u6BB5\u5145\u6EE1\u8C1C\u9898\u4E0E\u5371\u9669\u7684\u65C5\u7A0B\u3002

\u{1F4CB} \u6E38\u620F\u89C4\u5219\uFF1A
\u2022 \u4F60\u62E5\u6709 100 HP\uFF08\u751F\u547D\u503C\uFF09\uFF0C\u6536\u96C6 5 \u679A\u573A\u666F\u5370\u8BB0\u5373\u53EF\u901A\u5173
\u2022 \u6BCF\u4E2A\u573A\u666F\u6709\u4E00\u9053\u8C1C\u9898\uFF0C\u7B54\u5BF9\u83B7\u5F97\u5370\u8BB0
\u2022 \u7B54\u9519\u4F1A\u6263\u9664 HP\uFF0CHP \u5F52\u96F6\u5219\u6E38\u620F\u7ED3\u675F
\u2022 \u6BCF\u9053\u9898\u6700\u591A\u5C1D\u8BD5 3 \u6B21

\u{1F3AE} \u53EF\u7528\u6307\u4EE4\uFF1A
\u2022 \u76F4\u63A5\u8F93\u5165\u7B54\u6848 \u2014 \u56DE\u7B54\u5F53\u524D\u8C1C\u9898
\u2022 "\u63D0\u793A" / "hint" \u2014 \u83B7\u53D6\u63D0\u793A\uFF08\u6D88\u8017 HP\uFF09
\u2022 "\u72B6\u6001" / "status" \u2014 \u67E5\u770B\u5F53\u524D\u72B6\u6001
\u2022 "\u9053\u5177" / "item" \u2014 \u67E5\u770B/\u4F7F\u7528\u9053\u5177
\u2022 "\u63A2\u7D22" / "look" \u2014 \u91CD\u65B0\u67E5\u770B\u573A\u666F\u63CF\u8FF0
\u2022 "\u5E2E\u52A9" / "help" \u2014 \u663E\u793A\u672C\u5E2E\u52A9\u4FE1\u606F
\u2022 "\u653E\u5F03" / "skip" \u2014 \u653E\u5F03\u5F53\u524D\u8C1C\u9898\uFF08-20 HP\uFF09

\u{1F48A} \u9053\u5177\u8BF4\u660E\uFF1A
\u2022 \u751F\u547D\u9732\u73E0 \u2014 \u6062\u590D 20 HP
\u2022 \u8FF7\u96FE\u706F\u7B3C \u2014 \u514D\u8D39\u83B7\u53D6\u4E00\u6B21\u63D0\u793A
\u2022 \u65F6\u95F4\u6C99\u6F0F \u2014 \u989D\u5916\u83B7\u5F97\u4E00\u6B21\u7B54\u9898\u673A\u4F1A

\u51C6\u5907\u597D\u4E86\u5417\uFF1F\u8FF7\u96FE\u68EE\u6797\u5728\u7B49\u7740\u4F60\u2026\u2026
\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550
`;
  var HELP_TEXT = `
\u{1F3AE} \u6307\u4EE4\u8BF4\u660E\uFF1A
\u2022 \u76F4\u63A5\u8F93\u5165\u7B54\u6848\u5373\u53EF\u56DE\u7B54\u8C1C\u9898
\u2022 "\u63D0\u793A" \u2014 \u83B7\u53D6\u4E0B\u4E00\u7EA7\u63D0\u793A\uFF08Level 1: -5HP, Level 2: -10HP, Level 3: -15HP\uFF09
\u2022 "\u72B6\u6001" \u2014 \u67E5\u770B HP / \u5370\u8BB0 / \u9053\u5177
\u2022 "\u9053\u5177 [\u540D\u79F0]" \u2014 \u4F7F\u7528\u6307\u5B9A\u9053\u5177\uFF08\u5982\uFF1A"\u4F7F\u7528\u751F\u547D\u9732\u73E0"\uFF09
\u2022 "\u63A2\u7D22" \u2014 \u91CD\u65B0\u67E5\u770B\u5F53\u524D\u573A\u666F\u63CF\u8FF0
\u2022 "\u653E\u5F03" \u2014 \u653E\u5F03\u5F53\u524D\u8C1C\u9898\uFF0C\u8FDB\u5165\u4E0B\u4E00\u573A\u666F\uFF08-20 HP\uFF0C\u4E0D\u83B7\u5F97\u5370\u8BB0\uFF09
\u2022 "\u5E2E\u52A9" \u2014 \u663E\u793A\u672C\u5E2E\u52A9\u4FE1\u606F
`;
  var GuideAgent = class extends BaseAgent {
    constructor(context) {
      super("guide", context);
    }
    async handleMessage(msg) {
      switch (msg.action) {
        case "show_tutorial":
          return this.buildResponse(msg, { success: true, display_text: TUTORIAL_TEXT });
        case "show_help":
          return this.buildResponse(msg, { success: true, display_text: HELP_TEXT });
        case "handle_invalid":
          return this.handleInvalid(msg);
        default:
          return this.buildResponse(msg, {
            success: false,
            error: { code: "UNSUPPORTED_ACTION", message: `Guide does not handle ${msg.action}` }
          });
      }
    }
    handleInvalid(msg) {
      const input = msg.payload.player_input ?? "";
      let text;
      if (input.length === 0) {
        text = '\u8BF7\u8F93\u5165\u6307\u4EE4\u6216\u7B54\u6848\u3002\u8F93\u5165"\u5E2E\u52A9"\u67E5\u770B\u53EF\u7528\u6307\u4EE4\u3002';
      } else if (input.length > 200) {
        text = '\u8F93\u5165\u8FC7\u957F\uFF0C\u8BF7\u7B80\u6D01\u4F5C\u7B54\u6216\u4F7F\u7528\u6307\u4EE4\u3002\u8F93\u5165"\u5E2E\u52A9"\u67E5\u770B\u53EF\u7528\u6307\u4EE4\u3002';
      } else {
        text = `\u65E0\u6CD5\u7406\u89E3"${input.substring(0, 20)}${input.length > 20 ? "..." : ""}"\u3002
\u8BF7\u8F93\u5165\u7B54\u6848\uFF0C\u6216\u4F7F\u7528"\u5E2E\u52A9"\u67E5\u770B\u53EF\u7528\u6307\u4EE4\u3002`;
      }
      return this.buildResponse(msg, { success: true, display_text: text });
    }
  };

  // web/main.ts
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
  var outputArea = document.getElementById("output-area");
  var playerInput = document.getElementById("player-input");
  var sendBtn = document.getElementById("send-btn");
  var hpText = document.getElementById("hp-text");
  var hpBar = document.getElementById("hp-bar");
  var marksText = document.getElementById("marks-text");
  var itemsText = document.getElementById("items-text");
  var sceneName = document.getElementById("scene-name");
  var sceneAtmosphere = document.getElementById("scene-atmosphere");
  var game = createGame();
  var processing = false;
  function appendMessage(text, type = "system") {
    const div = document.createElement("div");
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
    const pct = hp / maxHp * 100;
    hpBar.style.width = `${pct}%`;
    hpBar.classList.toggle("danger", pct <= 25);
    hpBar.classList.toggle("warning", pct > 25 && pct <= 50);
    marksText.textContent = `${marks}/5`;
    itemsText.textContent = `${items}`;
    const currentScene = state.session.current_scene;
    if (currentScene) {
      const scene = SCENES.find((s) => s.id === currentScene);
      if (scene) {
        sceneName.textContent = scene.name;
        sceneAtmosphere.textContent = scene.atmosphere;
      }
    }
  }
  async function handleInput(input) {
    if (processing || !input.trim()) return;
    processing = true;
    sendBtn.disabled = true;
    playerInput.value = "";
    appendMessage(input, "player");
    if (/^(退出|quit|exit)$/i.test(input.trim())) {
      appendMessage("\u518D\u89C1\uFF0C\u5192\u9669\u8005\uFF01\u671F\u5F85\u4F60\u7684\u4E0B\u6B21\u5230\u6765\u3002");
      processing = false;
      sendBtn.disabled = false;
      return;
    }
    if (/^(重新开始|restart|reset)$/i.test(input.trim())) {
      game = createGame();
      outputArea.innerHTML = "";
      await startGame();
      processing = false;
      sendBtn.disabled = false;
      return;
    }
    try {
      const response = await game.gameMaster.processPlayerInput(input);
      appendMessage(response);
    } catch (e) {
      appendMessage("\u53D1\u751F\u4E86\u672A\u77E5\u9519\u8BEF\uFF0C\u8BF7\u91CD\u8BD5\u3002", "error");
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
  sendBtn.addEventListener("click", () => handleInput(playerInput.value));
  playerInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") handleInput(playerInput.value);
  });
  document.querySelectorAll(".quick-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const cmd = btn.dataset.cmd;
      if (cmd) handleInput(cmd);
    });
  });
  function createParticles() {
    const container = document.getElementById("particles");
    for (let i = 0; i < 20; i++) {
      const p = document.createElement("div");
      p.className = "particle";
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
})();
