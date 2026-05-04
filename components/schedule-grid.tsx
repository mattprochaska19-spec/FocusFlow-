import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  DAY_LABELS_SHORT,
  formatBlockedApps,
  type ScheduleBlock,
} from '@/lib/schedule';
import { colors, fonts, radius } from '@/lib/theme';

const HOUR_HEIGHT = 30;
const HOUR_LABEL_WIDTH = 36;
const HEADER_HEIGHT = 28;
const TOTAL_BODY_HEIGHT = HOUR_HEIGHT * 24; // 720pt

// Read-only week-view calendar grid. 7 columns (Sun-Sat) × 24 rows (hours).
// Schedule blocks render as accent-colored rectangles, absolutely positioned
// inside a percentage-width day grid. Tap a block to edit.
export function ScheduleGrid({
  blocks,
  onBlockPress,
}: {
  blocks: ScheduleBlock[];
  onBlockPress: (block: ScheduleBlock) => void;
}) {
  return (
    <View style={styles.outerWrap}>
      <View style={styles.header}>
        <View style={{ width: HOUR_LABEL_WIDTH }} />
        {DAY_LABELS_SHORT.map((label, i) => (
          <View style={styles.dayHeaderCell} key={i}>
            <Text style={styles.dayHeaderText}>{label}</Text>
          </View>
        ))}
      </View>

      <ScrollView
        style={styles.scrollWrap}
        contentContainerStyle={{ height: TOTAL_BODY_HEIGHT }}
        showsVerticalScrollIndicator={false}>
        <View style={styles.body}>
          {/* Hour label column */}
          <View style={styles.hourLabelColumn}>
            {Array.from({ length: 24 }).map((_, hour) => (
              <View key={hour} style={styles.hourLabelRow}>
                <Text style={styles.hourLabelText}>{formatHour(hour)}</Text>
              </View>
            ))}
          </View>

          {/* Day grid (where blocks are positioned) */}
          <View style={styles.dayGrid}>
            {/* Vertical column separators */}
            {Array.from({ length: 7 }).map((_, day) => (
              <View
                key={`col-${day}`}
                style={[
                  styles.colSeparator,
                  { left: `${(day / 7) * 100}%` },
                ]}
              />
            ))}

            {/* Horizontal hour separators */}
            {Array.from({ length: 25 }).map((_, hour) => (
              <View
                key={`row-${hour}`}
                style={[
                  styles.hourSeparator,
                  { top: hour * HOUR_HEIGHT },
                ]}
              />
            ))}

            {/* Blocks */}
            {blocks.map((block) => {
              const top = (block.startMinutes / 60) * HOUR_HEIGHT;
              const height = Math.max(
                ((block.endMinutes - block.startMinutes) / 60) * HOUR_HEIGHT,
                14,
              );
              const left = `${(block.dayOfWeek / 7) * 100}%`;
              const width = `${(1 / 7) * 100}%`;
              const limited = block.limitMinutes !== null && block.limitMinutes > 0;
              return (
                <Pressable
                  key={block.id}
                  onPress={() => onBlockPress(block)}
                  style={({ pressed }) => [
                    styles.block,
                    limited ? styles.blockLimited : styles.blockFull,
                    { top, height, left, width },
                    pressed && { opacity: 0.85 },
                  ]}>
                  <Text
                    style={[styles.blockText, limited && styles.blockTextLimited]}
                    numberOfLines={2}>
                    {block.label ?? formatBlockedApps(block.blockedApps)}
                  </Text>
                  {limited && (
                    <Text style={styles.blockLimitBadge}>
                      {block.limitMinutes}m
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

function formatHour(hour: number): string {
  if (hour === 0) return '12a';
  if (hour === 12) return '12p';
  if (hour < 12) return `${hour}a`;
  return `${hour - 12}p`;
}

const styles = StyleSheet.create({
  outerWrap: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    height: HEADER_HEIGHT,
    backgroundColor: colors.surfaceMuted,
    borderBottomWidth: 0.5,
    borderBottomColor: colors.hairline,
  },
  dayHeaderCell: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dayHeaderText: {
    color: colors.textMuted,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    fontFamily: fonts.bold,
  },

  scrollWrap: { maxHeight: 420 },
  body: { flexDirection: 'row', height: TOTAL_BODY_HEIGHT },

  hourLabelColumn: { width: HOUR_LABEL_WIDTH },
  hourLabelRow: {
    height: HOUR_HEIGHT,
    paddingTop: 2,
    paddingRight: 4,
    alignItems: 'flex-end',
  },
  hourLabelText: { color: colors.textMuted, fontSize: 9, fontWeight: '600' },

  dayGrid: {
    flex: 1,
    height: TOTAL_BODY_HEIGHT,
    position: 'relative',
  },
  colSeparator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 0.5,
    backgroundColor: colors.hairline,
  },
  hourSeparator: {
    position: 'absolute',
    left: 0,
    right: 0,
    height: 0.5,
    backgroundColor: colors.hairline,
  },
  block: {
    position: 'absolute',
    borderWidth: 1,
    borderRadius: 4,
    padding: 3,
    overflow: 'hidden',
  },
  // Fully blocked: solid accent fill
  blockFull: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  // Limited: softer translucent fill, hairline accent border
  blockLimited: {
    backgroundColor: colors.accentSoft,
    borderColor: colors.accentBorder,
  },
  blockText: {
    color: colors.textInverse,
    fontSize: 9,
    fontWeight: '700',
    letterSpacing: -0.1,
  },
  blockTextLimited: { color: colors.accent },
  blockLimitBadge: {
    position: 'absolute',
    top: 2,
    right: 3,
    color: colors.accent,
    fontSize: 8,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});
