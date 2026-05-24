export interface SceneConfig {
  id: string;
  name: string;
  environment: string;
  atmosphere: string;
  puzzle_type: string;
}

export const SCENES: SceneConfig[] = [
  { id: 'S1', name: '幽暗沼泽', environment: '浓雾弥漫、枯木遍地、水面冒泡', atmosphere: '压抑、危险', puzzle_type: 'logic' },
  { id: 'S2', name: '古树迷宫', environment: '巨木环绕、路径交错、苔藓发光', atmosphere: '迷惑、神秘', puzzle_type: 'pattern' },
  { id: 'S3', name: '遗忘神殿', environment: '石碑林立、符文闪烁、回音环绕', atmosphere: '庄严、古老', puzzle_type: 'cipher' },
  { id: 'S4', name: '萤火虫谷', environment: '漫天光点、溪流潺潺、花丛隐蔽', atmosphere: '宁静、暗藏玄机', puzzle_type: 'observation' },
  { id: 'S5', name: '暗影裂隙', environment: '空间扭曲、影子游移、低语呢喃', atmosphere: '恐怖、紧迫', puzzle_type: 'decision' },
];

export function getScene(id: string): SceneConfig | undefined {
  return SCENES.find(s => s.id === id);
}
