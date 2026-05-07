import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { useFocus } from '@/lib/focus-context';
import { supabase } from '@/lib/supabase';
import { colors, fonts, radius, shadowSm } from '@/lib/theme';

// First-visit tooltip card. Pass a stable `id` (e.g. 'family-tab-intro') and
// short copy. If the user has already dismissed it, nothing renders. On
// dismiss we fire the dismiss_tooltip RPC and append to the local profile
// state so the dismissal sticks instantly even before the next profile fetch.
//
// Visual: small floating card at the top of the screen with Pandu's accent
// stripe on the left, a title, body, and an X to close. Fades in on first
// mount; doesn't re-fade-in on subsequent renders.
export function Tooltip({
  id,
  title,
  body,
  variant = 'top',
}: {
  id: string;
  title: string;
  body: string;
  variant?: 'top' | 'inline';
}) {
  const { profile } = useFocus();
  const [dismissed, setDismissed] = useState(false);
  const opacity = useRef(new Animated.Value(0)).current;

  // Start hidden until we know the user's tooltip state from profile, then
  // fade in only if they haven't seen this tooltip yet.
  const alreadyDismissed = profile?.dismissedTooltips.includes(id) ?? false;
  const visible = !alreadyDismissed && !dismissed && !!profile;

  useEffect(() => {
    if (visible) {
      Animated.timing(opacity, {
        toValue: 1,
        duration: 260,
        delay: 400, // small breath so the screen settles before the tooltip pops
        useNativeDriver: true,
      }).start();
    }
  }, [visible, opacity]);

  if (!visible) return null;

  const dismiss = async () => {
    setDismissed(true);
    // Best-effort: fire-and-forget. Local state already hides the card; if
    // the RPC fails, the user will see the tooltip once more next launch.
    supabase.rpc('dismiss_tooltip', { p_tooltip_id: id }).catch(() => {});
  };

  return (
    <Animated.View
      style={[
        variant === 'top' ? styles.top : styles.inline,
        { opacity },
      ]}>
      <View style={styles.stripe} />
      <View style={styles.body}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.bodyText}>{body}</Text>
      </View>
      <Pressable onPress={dismiss} hitSlop={10} style={styles.closeBtn}>
        <Ionicons name="close" size={16} color={colors.textMuted} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
    marginBottom: 16,
    ...shadowSm,
  },
  inline: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: colors.accentSoft,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.accentBorder,
    overflow: 'hidden',
    marginBottom: 12,
  },
  stripe: { width: 4, alignSelf: 'stretch', backgroundColor: colors.accent },
  body: { flex: 1, paddingHorizontal: 12, paddingVertical: 12 },
  title: {
    color: colors.textPrimary,
    fontSize: 13,
    fontFamily: fonts.bold,
    letterSpacing: -0.2,
    marginBottom: 3,
  },
  bodyText: { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },
  closeBtn: { padding: 10 },
});
