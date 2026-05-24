import { BaseAgent } from '../../core/agent-base';
import { AgentMessage } from '../../core/message';
import { ContextManager } from '../../core/context';

const TUTORIAL_TEXT = `
═══════════════════════════════════════
    🌲 迷雾森林 — 文字探险解谜 🌲
═══════════════════════════════════════

欢迎来到迷雾森林！你将踏上一段充满谜题与危险的旅程。

📋 游戏规则：
• 你拥有 100 HP（生命值），收集 5 枚场景印记即可通关
• 每个场景有一道谜题，答对获得印记
• 答错会扣除 HP，HP 归零则游戏结束
• 每道题最多尝试 3 次

🎮 可用指令：
• 直接输入答案 — 回答当前谜题
• "提示" / "hint" — 获取提示（消耗 HP）
• "状态" / "status" — 查看当前状态
• "道具" / "item" — 查看/使用道具
• "探索" / "look" — 重新查看场景描述
• "帮助" / "help" — 显示本帮助信息
• "放弃" / "skip" — 放弃当前谜题（-20 HP）

💊 道具说明：
• 生命露珠 — 恢复 20 HP
• 迷雾灯笼 — 免费获取一次提示
• 时间沙漏 — 额外获得一次答题机会

准备好了吗？迷雾森林在等着你……
═══════════════════════════════════════
`;

const HELP_TEXT = `
🎮 指令说明：
• 直接输入答案即可回答谜题
• "提示" — 获取下一级提示（Level 1: -5HP, Level 2: -10HP, Level 3: -15HP）
• "状态" — 查看 HP / 印记 / 道具
• "道具 [名称]" — 使用指定道具（如："使用生命露珠"）
• "探索" — 重新查看当前场景描述
• "放弃" — 放弃当前谜题，进入下一场景（-20 HP，不获得印记）
• "帮助" — 显示本帮助信息
`;

export class GuideAgent extends BaseAgent {
  constructor(context: ContextManager) {
    super('guide', context);
  }

  async handleMessage(msg: AgentMessage): Promise<AgentMessage> {
    switch (msg.action) {
      case 'show_tutorial':
        return this.buildResponse(msg, { success: true, display_text: TUTORIAL_TEXT });
      case 'show_help':
        return this.buildResponse(msg, { success: true, display_text: HELP_TEXT });
      case 'handle_invalid':
        return this.handleInvalid(msg);
      default:
        return this.buildResponse(msg, {
          success: false,
          error: { code: 'UNSUPPORTED_ACTION', message: `Guide does not handle ${msg.action}` },
        });
    }
  }

  private handleInvalid(msg: AgentMessage): AgentMessage {
    const input = ((msg.payload as Record<string, unknown>).player_input as string) ?? '';
    let text: string;

    if (input.length === 0) {
      text = '请输入指令或答案。输入"帮助"查看可用指令。';
    } else if (input.length > 200) {
      text = '输入过长，请简洁作答或使用指令。输入"帮助"查看可用指令。';
    } else {
      text = `无法理解"${input.substring(0, 20)}${input.length > 20 ? '...' : ''}"。\n请输入答案，或使用"帮助"查看可用指令。`;
    }

    return this.buildResponse(msg, { success: true, display_text: text });
  }
}
