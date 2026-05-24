export interface ItemDef {
  name: string;
  effect: 'heal' | 'free_hint' | 'extra_turn';
  description: string;
  heal_amount?: number;
}

export const ITEMS: ItemDef[] = [
  { name: '生命露珠', effect: 'heal', description: '恢复 20 HP', heal_amount: 20 },
  { name: '迷雾灯笼', effect: 'free_hint', description: '免费获取一次提示（不扣 HP）' },
  { name: '时间沙漏', effect: 'extra_turn', description: '限时谜题回合数 +1' },
];

export function getItemDef(name: string): ItemDef | undefined {
  return ITEMS.find(i => i.name === name);
}
