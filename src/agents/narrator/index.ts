import { BaseAgent } from '../../core/agent-base';
import { AgentMessage, RenderScenePayload } from '../../core/message';
import { ContextManager } from '../../core/context';
import { getScene } from '../../data/scenes';

const SCENE_DESCRIPTIONS: Record<string, string[]> = {
  S1: [
    '浓雾从四面八方涌来，脚下的沼泽地冒着气泡，枯死的树木如同扭曲的手臂伸向灰暗的天空。空气中弥漫着腐烂的气息，偶尔传来不知名生物的低吟。你感到一种无形的压迫感正在逼近……',
    '沼泽深处传来阵阵"咕噜"声，雾气如同活物般蠕动。前方隐约可见三条小径，地面上散落着奇怪的标记。远处有微弱的光芒在雾中闪烁，仿佛在引导着什么。',
    '脚下的地面开始变软，浑浊的水面映出你模糊的倒影。枯木上刻着古老的符号，似乎在讲述某个被遗忘的故事。一只乌鸦停在最高的枯枝上，黑色的眼睛似乎看透了一切。',
  ],
  S2: [
    '巨大的古树遮天蔽日，树根如蛇般交错盘旋。苔藓散发着幽幽的绿光，为这片无尽的迷宫提供了唯一的照明。每棵树都像是有了生命，似乎在随着你的移动而缓缓转动……',
    '光滑的树皮上浮现出奇异的纹路，排列整齐如同某种密码。地面的落叶被风卷起，形成了一个又一个旋涡。你注意到某些树干上的年轮数量异常规律。',
    '迷宫的通道似乎在不断变化，但仔细观察会发现树上的发光苔藓形成了某种图案。空气中飘荡着古老的木质香气，远处传来微弱的钟声。',
  ],
  S3: [
    '宏伟的石殿矗立在迷雾之中，巨大的石碑上刻满了闪烁的符文。回音在穹顶下不断回荡，仿佛千年前的祈祷声从未消散。空气中弥漫着古老的力量，令人敬畏……',
    '石碑上的符文突然亮了起来，排列组合似乎蕴含着某种规律。神殿深处传来沉重的机关声，墙壁上的浮雕描绘着一个远古文明的故事。',
    '祭坛上摆放着一块破损的石板，上面的文字部分已被磨损。四周的石柱上各刻着不同的符号，仿佛在等待正确的顺序被激活。',
  ],
  S4: [
    '漫天的萤火虫织成一片光之海洋，溪水在月光下潺潺流淌。花丛中隐藏着无数秘密，看似宁静的山谷中暗藏玄机。萤光的闪烁频率似乎蕴含着某种信息……',
    '萤火虫们以特定的节奏闪烁，仿佛在传递某种古老的讯号。溪流中的鹅卵石上刻着奇怪的符号，与入口处的图案遥相呼应。',
    '一群萤火虫围绕着一朵夜百合缓缓飞舞，它们的闪烁模式与花瓣上的纹路产生了奇妙的对应。远处传来悦耳的风铃声。',
  ],
  S5: [
    '空间在这里扭曲变形，影子不再服从光线的指挥。低沉的呢喃声从四面八方传来，时间似乎在这里失去了意义。裂隙中涌出的暗能量正在逼近，你必须迅速做出抉择……',
    '三个影子从裂隙中涌出，向不同方向蔓延。它们的移动速度越来越快，你只有有限的时间来封锁它们。墙上的裂缝正在扩大，做出决定吧！',
    '暗影在身后汇聚成形，前方的路分成两条。左边的通道发出微弱的光，右边的通道传来金属碰撞声。影子越来越近了……',
  ],
};

export class NarratorAgent extends BaseAgent {
  constructor(context: ContextManager) {
    super('narrator', context);
  }

  async handleMessage(msg: AgentMessage): Promise<AgentMessage> {
    switch (msg.action) {
      case 'render_scene':
        return this.handleRenderScene(msg);
      case 'render_ending':
        return this.handleRenderEnding(msg);
      default:
        return this.buildResponse(msg, {
          success: false,
          error: { code: 'UNSUPPORTED_ACTION', message: `Narrator does not handle ${msg.action}` },
        });
    }
  }

  private handleRenderScene(msg: AgentMessage): AgentMessage {
    const payload = msg.payload as unknown as RenderScenePayload;
    const scene = getScene(payload.scene_id);
    if (!scene) {
      return this.buildResponse(msg, { success: false, error: { code: 'SCENE_NOT_FOUND', message: `Scene ${payload.scene_id} not found` } });
    }

    const descriptions = SCENE_DESCRIPTIONS[scene.id] ?? SCENE_DESCRIPTIONS['S1'];
    const variantIdx = Math.floor(Math.random() * descriptions.length);
    const description = descriptions[variantIdx];

    const header = payload.trigger === 'enter'
      ? `\n【${scene.name}】\n`
      : '';

    return this.buildResponse(msg, {
      success: true,
      display_text: `${header}${description}`,
      data: { scene_id: scene.id, scene_name: scene.name },
    });
  }

  private handleRenderEnding(msg: AgentMessage): AgentMessage {
    const payload = msg.payload as { ending_type: 'victory' | 'defeated' | 'perfect'; stats?: Record<string, unknown> };
    let text: string;

    switch (payload.ending_type) {
      case 'victory':
        text = '迷雾缓缓散去，阳光穿透树冠洒落。五枚印记在你掌心汇聚成一道光柱，直冲天际。森林中的一切生灵仿佛在为你欢呼——你成功解开了迷雾森林所有的谜题，找到了通往自由的道路！\n\n🎉 恭喜通关！';
        break;
      case 'perfect':
        text = '迷雾消散的那一刻，整片森林化作了金色。五枚印记没有汇聚——它们化作了一顶由光编织的王冠，悬浮在你头顶。你不仅征服了迷雾森林，你以完美无瑕的姿态征服了它。传说中的「森林之心」认可了你……\n\n👑 完美通关！全程未受伤！';
        break;
      case 'defeated':
        text = '你的视线逐渐模糊，迷雾吞噬了最后一丝光亮。森林的低语变成了安魂曲，你感到身体越来越沉重……意识消散前，你似乎听到远处有人在呼唤你的名字。\n\n💀 游戏结束——生命值已耗尽。';
        break;
    }

    if (payload.stats) {
      const stats = payload.stats;
      text += `\n\n📊 本局统计：\n- 收集印记：${stats.marks ?? 0}/5\n- 总尝试次数：${stats.attempts ?? 0}\n- 剩余 HP：${stats.hp ?? 0}`;
    }

    return this.buildResponse(msg, { success: true, display_text: text });
  }
}
