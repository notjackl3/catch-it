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

function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : iso;
}

function estimateDepartMs(arriveByISO: string, durationSeconds?: number): number | undefined {
  if (!durationSeconds) return undefined;
  const arriveMs = new Date(arriveByISO).getTime();
  if (!Number.isFinite(arriveMs)) return undefined;
  return arriveMs - durationSeconds * 1000;
}

export function ResultsScreen() {
  const route = useRoute<R>();
  const { stops, legs } = route.params;
  const start = stops[0]?.place;
  const end = stops[stops.length - 1]?.place;

  const [expandedKey, setExpandedKey] = useState<string | null>(() => {
    const firstLeg = legs[0];
    const firstRoute = firstLeg?.routes?.[0];
    return firstLeg && firstRoute ? `${firstLeg.id}:${firstRoute.id}` : null;
  });

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <Text style={styles.title} numberOfLines={2}>
          {start?.name ?? 'Start'} → {end?.name ?? 'End'}
        </Text>
        <Text style={styles.sub} numberOfLines={2}>
          {start?.address ?? ''}{start?.address && end?.address ? ' • ' : ''}{end?.address ?? ''}
        </Text>
      </View>

      {legs.length === 0 ? (
        <Text style={styles.empty}>
          No legs were computed. Add at least 2 stops and try again.
        </Text>
      ) : null}

      {legs.map((leg, legIdx) => {
        const from = stops.find((s) => s.id === leg.fromStopId)?.place;
        const to = stops.find((s) => s.id === leg.toStopId)?.place;

        // Feasibility check for this leg (except the first leg): ensure we can depart after arriving + dwell.
        let feasibilityWarning: string | null = null;
        if (legIdx > 0) {
          const prevLeg = legs[legIdx - 1];
          const prevArriveMs = new Date(prevLeg.arriveByISO).getTime();
          const neededDepartMs = prevArriveMs + leg.dwellMinutesAtFromStop * 60_000;
          const chosen = leg.routes[0];
          const estDepartMs = estimateDepartMs(leg.arriveByISO, chosen?.durationSeconds);
          if (Number.isFinite(neededDepartMs) && estDepartMs !== undefined && estDepartMs < neededDepartMs) {
            feasibilityWarning =
              `Tight schedule: this leg likely needs you to depart around ${new Date(estDepartMs).toLocaleString()}, ` +
              `but you planned to arrive at the previous stop by ${fmtDateTime(prevLeg.arriveByISO)} ` +
              `(+ ${leg.dwellMinutesAtFromStop} min).`;
          }
        }

        return (
          <View key={leg.id} style={styles.legBlock}>
            <Text style={styles.legTitle}>
              Leg {legIdx + 1}: {from?.name ?? 'From'} → {to?.name ?? 'To'}
            </Text>
            <Text style={styles.legMeta}>
              Arrive by: {fmtDateTime(leg.arriveByISO)}
              {legIdx > 0 ? ` • Dwell at start: ${leg.dwellMinutesAtFromStop} min` : ''}
            </Text>
            {feasibilityWarning ? <Text style={styles.warn}>{feasibilityWarning}</Text> : null}

            {leg.routes.length === 0 ? (
              <Text style={styles.empty}>
                No routes returned for this leg. You may need to adjust `travelMode`/field mask in
                `src/api/google/routes.ts` or verify API support in your region.
              </Text>
            ) : null}

            {leg.routes.map((r, idx) => {
              const key = `${leg.id}:${r.id}`;
              const expanded = expandedKey === key;
              return (
                <Pressable
                  key={key}
                  style={styles.card}
                  onPress={() => setExpandedKey((cur) => (cur === key ? null : key))}
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

                  {expanded ? (
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
              );
            })}
          </View>
        );
      })}
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
  warn: { color: '#9a3412', marginTop: 6 },
  legBlock: { gap: 8, paddingTop: 6 },
  legTitle: { fontSize: 15, fontWeight: '800' },
  legMeta: { fontSize: 12, color: '#666' },
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


