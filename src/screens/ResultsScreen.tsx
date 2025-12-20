import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';

import type { RootStackParamList } from '../navigation/types';

type R = RouteProp<RootStackParamList, 'Results'>;

function fmtDuration(seconds?: number): string {
  if (!seconds) return '—';
  const mins = Math.round(seconds / 60);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${h}h ${m}m`;
}

export function ResultsScreen() {
  const route = useRoute<R>();
  const { origin, destination, routes } = route.params;
  const [expandedId, setExpandedId] = useState<string | null>(routes[0]?.id ?? null);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {origin.name} → {destination.name}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {origin.address ?? ''}{origin.address && destination.address ? ' • ' : ''}{destination.address ?? ''}
        </Text>
      </View>

      {routes.length === 0 ? (
        <Text style={styles.empty}>
          No routes returned. If you’re expecting transit, you may need to adjust the request in
          `src/api/google/routes.ts` (travelMode/field mask) or verify API support in your region.
        </Text>
      ) : null}

      {routes.map((r, idx) => (
        <Pressable
          key={r.id}
          style={styles.card}
          onPress={() => setExpandedId((cur) => (cur === r.id ? null : r.id))}
        >
          <View style={styles.row}>
            <Text style={styles.cardTitle}>Option {idx + 1}</Text>
            <Text style={styles.cardTitle}>{fmtDuration(r.durationSeconds)}</Text>
          </View>
          <Text style={styles.meta}>
            {typeof r.distanceMeters === 'number' ? `${(r.distanceMeters / 1000).toFixed(1)} km` : '—'}
          </Text>
          <Text style={styles.meta} numberOfLines={2}>
            {r.steps.slice(0, 2).map((s) => s.instruction).join(' • ') || 'No step instructions returned'}
          </Text>

          {expandedId === r.id ? (
            <View style={styles.steps}>
              <Text style={styles.stepsTitle}>Steps</Text>
              {r.steps.length === 0 ? (
                <Text style={styles.stepText}>No step instructions returned.</Text>
              ) : (
                r.steps.map((s, i) => (
                  <Text key={i} style={styles.stepText}>
                    {i + 1}. {s.instruction}
                  </Text>
                ))
              )}
            </View>
          ) : null}
        </Pressable>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  content: { padding: 16, gap: 12 },
  header: { gap: 4 },
  title: { fontSize: 16, fontWeight: '700' },
  sub: { fontSize: 12, color: '#666' },
  empty: { color: '#b00020', marginTop: 8 },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fafafa',
    gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontWeight: '700' },
  meta: { color: '#444' },
  steps: { marginTop: 8, gap: 6 },
  stepsTitle: { fontWeight: '800' },
  stepText: { color: '#111' },
});


