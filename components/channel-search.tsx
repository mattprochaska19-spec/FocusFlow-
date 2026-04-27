import { Ionicons } from '@expo/vector-icons';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Image,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { colors, radius } from '@/lib/theme';
import { searchChannels, type ChannelSearchResult } from '@/lib/youtube-filter';

const DEBOUNCE_MS = 400;

export function ChannelSearch({
  apiKey,
  onSelect,
  placeholder = 'Search channels…',
}: {
  apiKey: string;
  onSelect: (channel: ChannelSearchResult) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<ChannelSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  useEffect(() => {
    if (!apiKey || !query.trim()) {
      setResults([]);
      setSearching(false);
      setError(null);
      return;
    }

    const mySeq = ++seq.current;
    const handle = setTimeout(async () => {
      setSearching(true);
      setError(null);
      try {
        const r = await searchChannels(query, apiKey);
        // Discard if a newer search has already started
        if (mySeq !== seq.current) return;
        setResults(r);
      } catch (err) {
        if (mySeq !== seq.current) return;
        setError(err instanceof Error ? err.message : String(err));
        setResults([]);
      } finally {
        if (mySeq === seq.current) setSearching(false);
      }
    }, DEBOUNCE_MS);

    return () => clearTimeout(handle);
  }, [query, apiKey]);

  const handleSelect = (channel: ChannelSearchResult) => {
    onSelect(channel);
    setQuery('');
    setResults([]);
    setError(null);
  };

  return (
    <View>
      <View style={styles.inputRow}>
        <Ionicons name="search" size={16} color={colors.textMuted} style={styles.searchIcon} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder={placeholder}
          placeholderTextColor={colors.textMuted}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.input}
        />
        {searching && <ActivityIndicator size="small" color={colors.textMuted} style={styles.spinner} />}
      </View>

      {!apiKey && query.trim().length > 0 && (
        <Text style={styles.hint}>Add a YouTube API key above to enable search.</Text>
      )}

      {error && <Text style={styles.errorText}>{error}</Text>}

      {results.length > 0 && (
        <View style={styles.resultsWrap}>
          {results.map((c, i) => (
            <Pressable
              key={c.channelId}
              onPress={() => handleSelect(c)}
              style={({ pressed }) => [
                styles.resultRow,
                i < results.length - 1 && styles.resultDivider,
                pressed && { backgroundColor: colors.surfaceMuted },
              ]}>
              {c.thumbnailUrl ? (
                <Image source={{ uri: c.thumbnailUrl }} style={styles.avatar} />
              ) : (
                <View style={[styles.avatar, styles.avatarFallback]}>
                  <Ionicons name="person" size={14} color={colors.textMuted} />
                </View>
              )}
              <View style={{ flex: 1 }}>
                <Text style={styles.resultTitle} numberOfLines={1}>{c.title}</Text>
                {c.description ? (
                  <Text style={styles.resultDesc} numberOfLines={1}>{c.description}</Text>
                ) : null}
              </View>
              <Ionicons name="add-circle" size={20} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceMuted,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    paddingHorizontal: 12,
  },
  searchIcon: { marginRight: 8 },
  input: {
    flex: 1,
    paddingVertical: 11,
    color: colors.textPrimary,
    fontSize: 14,
  },
  spinner: { marginLeft: 8 },

  hint: { color: colors.textMuted, fontSize: 11, marginTop: 8 },
  errorText: { color: colors.danger, fontSize: 12, marginTop: 8 },

  resultsWrap: {
    marginTop: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.borderSubtle,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  resultRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  resultDivider: { borderBottomWidth: 1, borderBottomColor: colors.borderSubtle },
  avatar: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.surfaceMuted,
  },
  avatarFallback: { alignItems: 'center', justifyContent: 'center' },
  resultTitle: { color: colors.textPrimary, fontSize: 14, fontWeight: '600', letterSpacing: -0.2 },
  resultDesc: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
});
