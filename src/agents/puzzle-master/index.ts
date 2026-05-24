import { BaseAgent } from '../../core/agent-base';
import { AgentMessage, StateOperation, ValidateAnswerPayload, RequestHintPayload } from '../../core/message';
import { ContextManager } from '../../core/context';
import { HP, GAME, HINT_COSTS } from '../../data/constants';

export interface PuzzleEntry {
  id: string;
  scene_id: string;
  question: string;
  answer: string;
  accept_patterns: RegExp[];
  hints: [string, string, string];
}

const PUZZLE_LIBRARY: PuzzleEntry[] = [
  // S1 - 逻辑推理
  {
    id: 'S1_V1', scene_id: 'S1', question: '沼泽中有三条路，分别立着石碑：第一块写"此路安全"，第二块写"三条路中只有一块石碑说了真话"，第三块写"第一条路危险"。只有一条路是安全的，哪条路？',
    answer: '3', accept_patterns: [/^3$/, /第三/, /三号/, /右/],
    hints: ['注意：如果第一块石碑说真话，看看是否矛盾', '第二块石碑是关键——如果它为真，其他两块都为假', '第二块为真 → 第一块为假（此路不安全）→ 第三块为假？不对。再想想：第二块为真 → 只有它为真 → 第一块假 → 第一条路不安全，第三块也假？但第三块说第一条路危险，这与第一块假一致……所以第三条路安全'],
  },
  {
    id: 'S1_V2', scene_id: 'S1', question: '沼泽中央有一座断桥，桥上写着："只有说出我的名字才能通过"。桥的两侧各刻着一个字——左边是"断"，右边是"桥"。你该说什么？',
    answer: '断桥', accept_patterns: [/断桥/],
    hints: ['答案就在眼前，不需要想太复杂', '看看桥上写了什么——"说出我的名字"', '桥的名字就是两边刻的字组合起来'],
  },
  {
    id: 'S1_V3', scene_id: 'S1', question: '三只青蛙坐在三片荷叶上。第一只说："我右边的在说谎"。第二只说："我们三个都在说谎"。第三只说："前两只至少有一只在说真话"。谁在说真话？',
    answer: '第一只和第三只', accept_patterns: [/1.*3/, /第一.*第三/, /一.*三/],
    hints: ['如果第二只说真话（三个都说谎），那它自己也在说谎——矛盾', '所以第二只一定在说谎。那么第三只说的"前两只至少有一只说真话"呢？', '第二只说谎 → 不是三个都说谎 → 至少有一个说真话。第三只的话成立。第一只说第二只说谎，也是真的'],
  },
  // S2 - 规律识别
  {
    id: 'S2_V1', scene_id: 'S2', question: '古树上刻着一组数字：2, 6, 12, 20, 30, ?。下一个数字是什么？',
    answer: '42', accept_patterns: [/^42$/],
    hints: ['观察相邻数字的差值：4, 6, 8, 10...', '差值本身构成了一个等差数列，公差为2', '下一个差值是12，所以答案是 30 + 12 = 42'],
  },
  {
    id: 'S2_V2', scene_id: 'S2', question: '发光苔藓排列出图案：🟢⚫🟢🟢⚫🟢🟢🟢⚫？？？⚫。问号处应该是什么？',
    answer: '🟢🟢🟢🟢', accept_patterns: [/4|四|绿{4}|🟢{4}/],
    hints: ['数一数每组绿光的数量', '规律是：1个, 2个, 3个...', '下一组应该是4个绿光'],
  },
  {
    id: 'S2_V3', scene_id: 'S2', question: '树干年轮数从外到内依次为：1, 1, 2, 3, 5, 8, ?。下一个是什么？',
    answer: '13', accept_patterns: [/^13$/],
    hints: ['这是一个经典的数学序列', '每个数字等于前两个数字之和', '5 + 8 = 13'],
  },
  // S3 - 密码解读
  {
    id: 'S3_V1', scene_id: 'S3', question: '石碑上刻着密文"GFNF TFDSFU"，旁边注释"每个字母都向后移动了一步"。原文是什么？',
    answer: 'FEME SECRET', accept_patterns: [/FEME.?SECRET/i],
    hints: ['将每个字母向前移动一位', 'G→F, F→E, N→M, F→E...', '完整解密：FEME SECRET'],
  },
  {
    id: 'S3_V2', scene_id: 'S3', question: '神殿地面上有五个符文，分别代表数字。已知：△=1, □=2, ○=3。求：△□○ + ○□△ = ?',
    answer: '456', accept_patterns: [/^456$/],
    hints: ['把符号替换成对应的数字，组成三位数', '△□○ = 123, ○□△ = 321', '123 + 321 = 444... 等等，再想想——这里是把符号直接替换后拼接计算'],
  },
  {
    id: 'S3_V3', scene_id: 'S3', question: '墙壁上写着"HELLO"的镜像文字（从右到左）。如果用同样的规则解读"DLROW"，原文是什么？',
    answer: 'WORLD', accept_patterns: [/^WORLD$/i],
    hints: ['镜像就是把字符串反转', '试着从右到左读这些字母', 'D-L-R-O-W 反转为 W-O-R-L-D'],
  },
  // S4 - 观察联想
  {
    id: 'S4_V1', scene_id: 'S4', question: '7只萤火虫以特定节奏闪烁：亮-亮-灭-亮-灭-亮-亮。入口处有四个符号——(A) ▪▪▫▪▫▪▪ (B) ▪▫▪▫▪▪▪ (C) ▪▪▪▫▪▫▪ (D) ▪▫▪▪▫▪▪。哪个符号与萤火虫的闪烁一致？',
    answer: 'A', accept_patterns: [/^[Aa]$/],
    hints: ['将"亮"对应"▪"，"灭"对应"▫"', '萤火虫：亮亮灭亮灭亮亮 → ▪▪▫▪▫▪▪', '逐一比对四个选项的第3和第5个位置是否为▫'],
  },
  {
    id: 'S4_V2', scene_id: 'S4', question: '溪流中有5块鹅卵石，上面分别刻着：日、月、星、辰、?。旁边的花瓣上写着"天上之物"。第五块石头应该是什么？',
    answer: '云', accept_patterns: [/^云$/],
    hints: ['前四个都是天上可见的事物', '"日月星辰"是一个常见的四字组合，第五个要扩展', '天上之物还有什么？风、雨、云……其中"云"最常与前四者并列'],
  },
  {
    id: 'S4_V3', scene_id: 'S4', question: '三朵花分别在不同时间绽放：第一朵在有月光时开放，第二朵在溪水声最大时开放，第三朵在萤火虫最多时开放。现在月亮被云遮住，溪水平缓，但萤火虫漫天飞舞。哪朵花正在绽放？',
    answer: '第三朵', accept_patterns: [/3|三|第三/],
    hints: ['分析当前的环境条件', '月亮被遮住 → 第一朵不开；溪水平缓 → 第二朵不开', '萤火虫漫天飞舞 → 萤火虫最多 → 第三朵绽放'],
  },
  // S5 - 限时决策
  {
    id: 'S5_V1', scene_id: 'S5', question: '三道影子分别从左、中、右逼近。你只有两次封锁机会。已知：中间的影子速度最快，左边的影子一旦到达会召唤更多影子。你应该先封哪两个方向？',
    answer: '左和中', accept_patterns: [/左.*中|中.*左/],
    hints: ['考虑不封锁每个方向的后果', '中间最快会先到——必须封；左边会召唤更多——必须封', '优先封锁左（阻止召唤）和中（阻止最快到达），右边的影子速度慢可以躲避'],
  },
  {
    id: 'S5_V2', scene_id: 'S5', question: '裂隙正在扩大，你有三个选择：(A) 用石头堵住裂隙 (B) 从裂隙中拉出光线 (C) 跳过裂隙逃跑。但是：石头可能碎裂，光线可能是陷阱，逃跑则放弃印记。墙上的线索写着"黑暗中唯有光明可以对抗黑暗"。你选哪个？',
    answer: 'B', accept_patterns: [/^[Bb]$|光线|拉.*光/],
    hints: ['注意墙上的线索', '"唯有光明可以对抗黑暗"——暗示了正确的方法', '从裂隙中拉出光线，用光明对抗暗影裂隙'],
  },
  {
    id: 'S5_V3', scene_id: 'S5', question: '你面前有两扇门：左门发出微弱白光，右门传来金属碰撞声。影子从身后逼近，你只有选择一扇门的时间。地上写着："声音是回忆，光是未来"。你选哪扇门？',
    answer: '左', accept_patterns: [/左|白光|光/],
    hints: ['注意地上的文字提示', '"声音是回忆"——回忆属于过去；"光是未来"——未来是前进方向', '选择代表"未来"的光之门（左门）'],
  },
];

export class PuzzleMasterAgent extends BaseAgent {
  private currentPuzzle: PuzzleEntry | null = null;

  constructor(context: ContextManager) {
    super('puzzle_master', context);
  }

  async handleMessage(msg: AgentMessage): Promise<AgentMessage> {
    switch (msg.action) {
      case 'generate_puzzle':
        return this.handleGeneratePuzzle(msg);
      case 'validate_answer':
        return this.handleValidateAnswer(msg);
      case 'request_hint':
        return this.handleRequestHint(msg);
      default:
        return this.buildResponse(msg, {
          success: false,
          error: { code: 'UNSUPPORTED_ACTION', message: `PuzzleMaster does not handle ${msg.action}` },
        });
    }
  }

  private handleGeneratePuzzle(msg: AgentMessage): AgentMessage {
    const payload = msg.payload as { scene_id: string; variant_index: number };
    const puzzles = PUZZLE_LIBRARY.filter(p => p.scene_id === payload.scene_id);
    if (puzzles.length === 0) {
      return this.buildResponse(msg, { success: false, error: { code: 'NO_PUZZLES', message: `No puzzles for scene ${payload.scene_id}` } });
    }

    const idx = payload.variant_index % puzzles.length;
    this.currentPuzzle = puzzles[idx];

    return this.buildResponse(msg, {
      success: true,
      display_text: `\n🧩 谜题：\n${this.currentPuzzle.question}\n\n（输入"提示"获取提示，输入"放弃"跳过此题）`,
      data: { puzzle_id: this.currentPuzzle.id, scene_id: this.currentPuzzle.scene_id },
    });
  }

  private handleValidateAnswer(msg: AgentMessage): AgentMessage {
    const payload = msg.payload as unknown as ValidateAnswerPayload;

    if ((msg.payload as Record<string, unknown>).force_skip) {
      const sideEffects: StateOperation[] = [
        { field: 'hp', op: 'subtract', value: HP.WRONG_THIRD, reason: '放弃谜题' },
        { field: 'current_attempt', op: 'set', value: 0, reason: '重置尝试次数' },
        { field: 'hints_used_current', op: 'set', value: 0, reason: '重置提示' },
        { field: 'consecutive_correct', op: 'set', value: 0, reason: '放弃打断连续正确' },
      ];
      this.currentPuzzle = null;
      return this.buildResponse(msg, {
        success: true,
        display_text: '你选择了放弃这道谜题。迷雾侵蚀了你的生命力……（-20 HP）',
        data: { correct: false, skipped: true },
        side_effects: sideEffects,
      });
    }

    if (!this.currentPuzzle) {
      return this.buildResponse(msg, { success: false, error: { code: 'NO_ACTIVE_PUZZLE', message: 'No active puzzle' } });
    }

    const isCorrect = this.currentPuzzle.accept_patterns.some(p => p.test(payload.player_answer.trim()));
    const sideEffects: StateOperation[] = [];

    if (isCorrect) {
      const hpGain = payload.hints_used > 0 ? HP.CORRECT_WITH_HINT : HP.CORRECT_FIRST;
      sideEffects.push(
        { field: 'hp', op: 'add', value: hpGain, reason: '答题正确' },
        { field: 'marks', op: 'push', value: this.currentPuzzle.scene_id, reason: '获得场景印记' },
        { field: 'scenes_completed', op: 'push', value: this.currentPuzzle.scene_id, reason: '场景完成' },
        { field: 'consecutive_correct', op: 'add', value: 1, reason: '连续正确+1' },
        { field: 'current_attempt', op: 'set', value: 0, reason: '重置' },
        { field: 'hints_used_current', op: 'set', value: 0, reason: '重置' },
      );

      if (Math.random() < GAME.ITEM_DROP_CHANCE) {
        sideEffects.push({ field: 'items', op: 'push', value: '生命露珠', reason: '答题正确掉落' });
      }

      const text = `✅ 回答正确！${payload.hints_used > 0 ? '(+5 HP)' : '(+10 HP)'}\n你获得了【${getScene(this.currentPuzzle.scene_id)}】的印记！`;
      this.currentPuzzle = null;
      return this.buildResponse(msg, { success: true, display_text: text, data: { correct: true }, side_effects: sideEffects });
    }

    // Wrong answer
    const attempt = payload.attempt_number;
    if (attempt >= GAME.MAX_ATTEMPTS_PER_PUZZLE) {
      sideEffects.push(
        { field: 'hp', op: 'subtract', value: HP.WRONG_THIRD, reason: '第3次答错' },
        { field: 'scenes_failed', op: 'push', value: this.currentPuzzle.scene_id, reason: '场景失败' },
        { field: 'current_attempt', op: 'set', value: 0, reason: '重置' },
        { field: 'hints_used_current', op: 'set', value: 0, reason: '重置' },
        { field: 'consecutive_correct', op: 'set', value: 0, reason: '连续正确中断' },
      );
      this.currentPuzzle = null;
      return this.buildResponse(msg, {
        success: true,
        display_text: `❌ 回答错误！这是第三次失败（-20 HP），谜题已关闭。你未能获得此场景的印记……`,
        data: { correct: false, failed_out: true },
        side_effects: sideEffects,
      });
    }

    const hpLoss = attempt === 1 ? HP.WRONG_FIRST : HP.WRONG_SECOND;
    sideEffects.push(
      { field: 'hp', op: 'subtract', value: hpLoss, reason: `第${attempt}次答错` },
      { field: 'current_attempt', op: 'add', value: 1, reason: '尝试次数+1' },
      { field: 'consecutive_correct', op: 'set', value: 0, reason: '连续正确中断' },
    );

    const remaining = GAME.MAX_ATTEMPTS_PER_PUZZLE - attempt;
    return this.buildResponse(msg, {
      success: true,
      display_text: `❌ 回答错误！(-${hpLoss} HP) 还有 ${remaining} 次机会。`,
      data: { correct: false, attempts_remaining: remaining },
      side_effects: sideEffects,
    });
  }

  private handleRequestHint(msg: AgentMessage): AgentMessage {
    const payload = msg.payload as unknown as RequestHintPayload;

    if (!this.currentPuzzle) {
      return this.buildResponse(msg, { success: false, error: { code: 'NO_ACTIVE_PUZZLE', message: 'No active puzzle' } });
    }

    const level = payload.current_hint_level;
    if (level >= GAME.MAX_HINTS_PER_PUZZLE) {
      return this.buildResponse(msg, {
        success: true,
        display_text: '已经没有更多提示了，请尝试作答吧。',
        data: { hint_available: false },
      });
    }

    const cost = HINT_COSTS[level];
    const hint = this.currentPuzzle.hints[level];
    const sideEffects: StateOperation[] = [
      { field: 'hp', op: 'subtract', value: cost, reason: `请求提示 Level ${level + 1}` },
      { field: 'hints_used_current', op: 'add', value: 1, reason: '使用提示' },
    ];

    return this.buildResponse(msg, {
      success: true,
      display_text: `💡 提示 ${level + 1}（-${cost} HP）：${hint}`,
      data: { hint_level: level + 1 },
      side_effects: sideEffects,
    });
  }

  getCurrentPuzzle(): PuzzleEntry | null {
    return this.currentPuzzle;
  }
}

function getScene(sceneId: string): string {
  const names: Record<string, string> = { S1: '幽暗沼泽', S2: '古树迷宫', S3: '遗忘神殿', S4: '萤火虫谷', S5: '暗影裂隙' };
  return names[sceneId] ?? sceneId;
}
