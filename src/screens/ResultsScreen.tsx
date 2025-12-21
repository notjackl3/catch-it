import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';

import type { RootStackParamList } from '../navigation/types';

type R = RouteProp<RootStackParamList, 'Results'>;

function renderBoldTokens(line: string): Array<{ text: string; bold: boolean }> {
  // regex to find all times and numbers
  const re = /(\b\d{1,2}:\d{2}\s?(?:AM|PM)?\b|\b\d+\b)/gi;
  const out: Array<{ text: string; bold: boolean }> = [];
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(line)) !== null) {
    if (m.index > last) out.push({ text: line.slice(last, m.index), bold: false });
    out.push({ text: m[0], bold: true });
    last = m.index + m[0].length;
  }
  if (last < line.length) out.push({ text: line.slice(last), bold: false });
  return out.length ? out : [{ text: line, bold: false }];
}

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
  return Number.isFinite(d.getTime())
    ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    : iso;
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

  // legId -> chosen routeId (within leg.routes)
  const [chosenByLegId, setChosenByLegId] = useState<Record<string, string>>({});

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
      </View>

      {legs.length === 0 ? (
        <Text style={styles.empty}>
          No directions can be were computed. Add at least 2 stops and try again.
        </Text>
      ) : null}

      {legs.map((leg, legIdx) => {
        const from = stops.find((s) => s.id === leg.fromStopId)?.place;
        const to = stops.find((s) => s.id === leg.toStopId)?.place;
        const nextLeg = legs[legIdx + 1];
        const nextStop = stops.find((s) => s.id === nextLeg?.toStopId)?.place;
        const chosenRouteId = chosenByLegId[leg.id];
        const visibleRoutes = chosenRouteId
          ? leg.routes.filter((r) => r.id === chosenRouteId)
          : leg.routes;

        // Feasibility check for this leg (except the first leg): ensure we can depart after arriving + dwell.
        let feasibilityWarning: string | null = null;
        if (legIdx > 0) {
          const prevLeg = legs[legIdx - 1];
          const prevArriveMs = new Date(prevLeg.arriveByISO).getTime();
          const neededDepartMs = prevArriveMs + leg.dwellMinutesAtFromStop * 60_000;
          const chosen = (chosenRouteId ? leg.routes.find((r) => r.id === chosenRouteId) : leg.routes[0]) ?? leg.routes[0];
          const estDepartMs = estimateDepartMs(leg.arriveByISO, chosen?.durationSeconds);
          if (Number.isFinite(neededDepartMs) && estDepartMs !== undefined && estDepartMs < neededDepartMs) {
            feasibilityWarning =
              `Tight schedule! This stop needs you to depart around ${new Date(estDepartMs).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}, ` +
              `but you planned to arrive at the previous stop by ${fmtDateTime(prevLeg.arriveByISO)} ` +
              `(+${leg.dwellMinutesAtFromStop} min).`;
          }
        }

        return (
          <View key={leg.id} style={styles.legBlock}>
            {nextLeg && nextLeg.dwellMinutesAtFromStop > 0 ? (
            <Text style={styles.legTiming}>
                Arrive at {to?.name ?? 'this stop'} at {fmtDateTime(leg.arriveByISO)} and stay for{' '}
                {nextLeg.dwellMinutesAtFromStop} min, then go to {nextStop?.name ?? 'next stop'}
            </Text>
            ) : (
            <Text style={styles.legTiming}>
                Arrive at {to?.name ?? 'this stop'} at {fmtDateTime(leg.arriveByISO)}
            </Text>
            )}
            {feasibilityWarning ? <Text style={styles.warn}>{feasibilityWarning}</Text> : null}

            {leg.routes.length === 0 ? (
              <Text style={styles.empty}>
                No routes returned for this leg. You may need to adjust `travelMode`/field mask in
                `src/api/google/routes.ts` or verify API support in your region.
              </Text>
            ) : null}

            {visibleRoutes.map((r, idx) => {
              const key = `${leg.id}:${r.id}`;
              // If an option is chosen for this leg, keep it always expanded.
              const expanded = Boolean(chosenRouteId) || expandedKey === key;
              return (
                <Pressable
                  key={key}
                  style={styles.card}
                  onPress={() => {
                    if (chosenRouteId) return; // chosen option stays expanded
                    setExpandedKey((cur) => (cur === key ? null : key));
                  }}
                >
                  <Text style={styles.cardRouteLine} numberOfLines={2}>
                    {from?.name ?? 'From'} → {to?.name ?? 'To'}
                  </Text>
                  <View style={styles.row}>
                    <Text style={styles.cardTitle}>
                      {chosenRouteId ? 'Chosen option' : `Option ${idx + 1}`}
                    </Text>
                    <Text style={styles.cardTitle}>{fmtDuration(r.durationSeconds)}</Text>
                  </View>
                  <Text style={styles.meta}>
                    {typeof r.distanceMeters === 'number' ? `${(r.distanceMeters / 1000).toFixed(1)} km` : '—'}
                  </Text>

                  {expanded ? (
                    <View style={styles.steps}>
                      {r.keyInstructions.length === 0 ? (
                        <Text style={styles.stepText}>No key instructions returned.</Text>
                      ) : (
                        r.keyInstructions.map((line, i) => (
                          <Text key={i} style={styles.stepText}>
                            <Text style={styles.bold}>{i + 1}</Text>
                            <Text style={styles.stepText}> - </Text>
                            {renderBoldTokens(line).map((t, j) => (
                              <Text key={j} style={t.bold ? styles.bold : styles.stepText}>
                                {t.text}
                              </Text>
                            ))}
                          </Text>
                        ))
                      )}
                    </View>
                  ) : null}

                  {!chosenRouteId ? (
                    <Pressable
                      style={styles.chooseButton}
                      onPress={() =>
                        setChosenByLegId((cur) => ({
                          ...cur,
                          [leg.id]: r.id,
                        }))
                      }
                    >
                      <Text style={styles.chooseButtonText}>Choose this option</Text>
                    </Pressable>
                  ) : null}
                </Pressable>
              );
            })}

            <View style={styles.legHeaderRow}>
              {chosenRouteId ? (
                <Pressable
                  onPress={() =>
                    setChosenByLegId((cur) => {
                      const next = { ...cur };
                      delete next[leg.id];
                      // When switching back to multi-option mode, collapse this leg by default.
                      setExpandedKey((prev) => (prev?.startsWith(`${leg.id}:`) ? null : prev));
                      return next;
                    })
                  }
                >
                  <Text style={styles.changeText}>Change</Text>
                </Pressable>
              ) : null}
            </View>
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
  legHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 12 },
  legTitle: { fontSize: 12, fontWeight: '800' },
  legMeta: { fontSize: 12, color: '#666' },
  changeText: { color: '#fff', backgroundColor: '#2563eb', paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, fontSize: 12, fontWeight: '800' },
  card: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 12,
    padding: 14,
    backgroundColor: '#fafafa',
    gap: 6,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 20, fontWeight: '700'},
  cardRouteLine: { color: '#111', fontWeight: '700' },
  meta: { color: '#444' },
  steps: { marginTop: 8, gap: 6 },
  stepsTitle: { fontWeight: '800' },
  stepText: { color: '#111' },
  legTiming: { color: '#4169e1' },
  bold: { fontWeight: '600', color: '#111'},
  chooseButton: {
    marginTop: 10,
    backgroundColor: '#80ef80',
    paddingVertical: 10,
    borderRadius: 10,
    alignItems: 'center',
  },
  chooseButtonText: { color: '#111', fontWeight: '800' },
});


