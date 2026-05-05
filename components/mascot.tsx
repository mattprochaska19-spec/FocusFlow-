import { Image, type ImageStyle, type StyleProp } from 'react-native';

// FocusFlow's mascot. Six poses cover the emotional range we surface in UI:
//   happy        — attentive idle, paws clasped, gentle smile
//   excited      — arms-up celebration (focus complete, +Xm earned)
//   encouraging  — wink + thumbs-up + heart (positive reinforcement)
//   thinking     — hand on chin (ambiguous / loading / contemplative empty states)
//   meditating   — lotus pose (active focus session)
//   disappointed — sad eyes, paws to chest (blocked content)
export type MascotPose =
  | 'happy'
  | 'excited'
  | 'encouraging'
  | 'thinking'
  | 'meditating'
  | 'disappointed';

// Static require map so Metro bundles every image. Adding a new pose: drop
// the PNG into assets/images/mascot/, add the require entry below, extend
// the MascotPose union.
const POSES = {
  happy: require('@/assets/images/mascot/panda-happy.png'),
  excited: require('@/assets/images/mascot/panda-excited.png'),
  encouraging: require('@/assets/images/mascot/panda-encouraging.png'),
  thinking: require('@/assets/images/mascot/panda-thinking.png'),
  meditating: require('@/assets/images/mascot/panda-meditating.png'),
  disappointed: require('@/assets/images/mascot/panda-disappointed.png'),
} as const;

type Size = 'sm' | 'md' | 'lg' | 'xl';

const SIZES: Record<Size, number> = {
  sm: 48,
  md: 80,
  lg: 120,
  xl: 180,
};

export function Mascot({
  pose,
  size = 'md',
  style,
}: {
  pose: MascotPose;
  size?: Size | number;
  style?: StyleProp<ImageStyle>;
}) {
  const dimension = typeof size === 'number' ? size : SIZES[size];
  return (
    <Image
      source={POSES[pose]}
      style={[{ width: dimension, height: dimension }, style]}
      resizeMode="contain"
    />
  );
}
