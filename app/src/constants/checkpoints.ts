import type { MaterialCommunityIcons } from '@expo/vector-icons';
import type { CheckpointKind } from '@scenic/shared';
import type { ComponentProps } from 'react';

type IconName = ComponentProps<typeof MaterialCommunityIcons>['name'];

/** How each checkpoint kind looks, and whether we ask for floors when it's added. */
export const CHECKPOINT_INFO: Record<
  CheckpointKind,
  { en: string; zh: string; icon: IconName; asksFloors: boolean; asksNote: boolean }
> = {
  lift: { en: 'Lift', zh: '升降機', icon: 'elevator', asksFloors: true, asksNote: false },
  escalator: {
    en: 'Escalator',
    zh: '扶手電梯',
    icon: 'escalator',
    asksFloors: true,
    asksNote: false,
  },
  stairs: { en: 'Stairs', zh: '樓梯', icon: 'stairs', asksFloors: true, asksNote: false },
  entrance: { en: 'Entrance', zh: '入口', icon: 'door', asksFloors: false, asksNote: false },
  footbridge: { en: 'Footbridge', zh: '天橋', icon: 'bridge', asksFloors: false, asksNote: false },
  underpass: { en: 'Underpass', zh: '隧道', icon: 'tunnel', asksFloors: false, asksNote: false },
  note: { en: 'Note', zh: '備註', icon: 'note-text', asksFloors: false, asksNote: true },
};

/** Order of the checkpoint buttons on the recording screen. */
export const CHECKPOINT_ORDER: CheckpointKind[] = [
  'lift',
  'escalator',
  'stairs',
  'entrance',
  'footbridge',
  'underpass',
  'note',
];

/** Common Hong Kong floor names, offered as quick buttons. */
export const FLOOR_CHOICES = ['B2', 'B1', 'LG', 'G', 'UG', 'L1', 'L2', 'L3', 'L4', 'L5'];

/** "Lift G → L2", "Stairs", "Note: closes at 10pm" */
export function describeCheckpoint(c: {
  kind: CheckpointKind;
  floorFrom: string | null;
  floorTo: string | null;
  note: string | null;
}): string {
  const name = CHECKPOINT_INFO[c.kind].en;
  if (c.floorFrom || c.floorTo) return `${name} ${c.floorFrom ?? '?'} → ${c.floorTo ?? '?'}`;
  if (c.note) return `${name}: ${c.note}`;
  return name;
}
