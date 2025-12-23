import { Alert, Linking, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useRoute } from '@react-navigation/native';
import type { RouteProp } from '@react-navigation/native';
import { useState } from 'react';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

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

function renderBoldTokensHtml(line: string): string {
  const re = /(\b\d{1,2}:\d{2}\s?(?:AM|PM)?\b|\b\d+\b)/gi;
  return line.replace(re, '<strong>$1</strong>');
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

function googleMapsDirectionsUrl(params: {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  travelMode: 'transit' | 'walking' | 'driving';
  departureTimeISO?: string;
}): string {
  const origin = `${params.origin.lat},${params.origin.lng}`;
  const destination = `${params.destination.lat},${params.destination.lng}`;

  const u = new URL('https://www.google.com/maps/dir/');
  u.searchParams.set('api', '1');
  u.searchParams.set('origin', origin);
  u.searchParams.set('destination', destination);
  u.searchParams.set('travelmode', params.travelMode);
  u.searchParams.set('dir_action', 'navigate');

  if (params.departureTimeISO) {
    const ms = new Date(params.departureTimeISO).getTime();
    if (Number.isFinite(ms)) {
      u.searchParams.set('departure_time', String(Math.floor(ms / 1000)));
    }
  }

  return u.toString();
}

export function ResultsScreen() {
  const route = useRoute<R>();
  const { stops, legs, startAt } = route.params;
  const start = stops[0]?.place;
  const end = stops[stops.length - 1]?.place;

  // legId -> chosen routeId (within leg.routes)
  const [chosenByLegId, setChosenByLegId] = useState<Record<string, string>>({});

  const [expandedKey, setExpandedKey] = useState<string | null>(() => {
    const firstLeg = legs[0];
    const firstRoute = firstLeg?.routes?.[0];
    return firstLeg && firstRoute ? `${firstLeg.id}:${firstRoute.id}` : null;
  });

  const exportToPdf = async () => {
    try {
      const html = `
        <html>
          <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, minimum-scale=1.0, user-scalable=no" />
            <style>
              body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 20px; color: #111; line-height: 1.5; }
              h1 { font-size: 24px; margin-bottom: 5px; color: #000; }
              .subtitle { font-size: 14px; color: #666; margin-bottom: 30px; }
              .leg { margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
              .leg-header { font-size: 18px; fontWeight: bold; margin-bottom: 10px; color: #2563eb; }
              .leg-timing { font-size: 14px; color: #4169e1; margin-bottom: 10px; }
              .route-info { background: #fafafa; border: 1px solid #eee; border-radius: 8px; padding: 15px; margin-bottom: 10px; }
              .route-title { font-size: 16px; font-weight: bold; margin-bottom: 5px; }
              .route-meta { font-size: 13px; color: #444; margin-bottom: 10px; }
              .steps { margin-top: 10px; }
              .step { margin-bottom: 8px; font-size: 14px; display: flex; }
              .step-num { font-weight: bold; margin-right: 10px; min-width: 20px; }
              .warning { color: #9a3412; font-size: 12px; margin-top: 5px; font-style: italic; }
              .maps-link { display: inline-block; margin-top: 15px; color: #2563eb; text-decoration: none; font-weight: bold; font-size: 14px; }
            </style>
          </head>
          <body>
            <h1>${start?.name ?? 'Start'} &rarr; ${end?.name ?? 'End'}</h1>
            <p class="subtitle">Generated on ${new Date().toLocaleDateString()} at ${new Date().toLocaleTimeString()}<br/>
            Start ${startAt.mode === 'now' ? 'now' : 'at'}: ${fmtDateTime(startAt.startAtISO)}</p>

            ${legs.map((leg, legIdx) => {
              const from = stops.find((s) => s.id === leg.fromStopId)?.place;
              const to = stops.find((s) => s.id === leg.toStopId)?.place;
              const chosenRouteId = chosenByLegId[leg.id];
              const chosenRoute = chosenRouteId 
                ? leg.routes.find(r => r.id === chosenRouteId)
                : leg.routes[0]; // fallback to first if none chosen for PDF
              
              if (!chosenRoute) return '';

              const mapsUrl = from && to ? googleMapsDirectionsUrl({
                origin: from.location,
                destination: to.location,
                travelMode: 'transit',
                departureTimeISO: chosenRoute.startAtISO ?? startAt.startAtISO,
              }) : null;

              return `
                <div class="leg">
                  <div class="leg-header">${from?.name ?? 'From'} &rarr; ${to?.name ?? 'To'}</div>
                  <div class="leg-timing">
                    Arrive at ${to?.name ?? 'this stop'} at ${fmtDateTime(leg.arriveByISO)}
                    ${leg.dwellMinutesAtFromStop > 0 ? ` (Stay for ${leg.dwellMinutesAtFromStop} min)` : ''}
                  </div>
                  
                  <div class="route-info">
                    <div class="route-title">${chosenRouteId ? 'Chosen Option' : 'Option 1 (Default)'} - ${fmtDuration(chosenRoute.durationSeconds)}</div>
                    <div class="route-meta">${typeof chosenRoute.distanceMeters === 'number' ? `${(chosenRoute.distanceMeters / 1000).toFixed(1)} km` : ''}</div>
                    
                    <div class="steps">
                      ${chosenRoute.keyInstructions.length > 0 
                        ? chosenRoute.keyInstructions.map((step, i) => `
                            <div class="step">
                              <span class="step-num">${i + 1}</span>
                              <span>${renderBoldTokensHtml(step)}</span>
                            </div>
                          `).join('')
                        : '<div class="step">No instructions available.</div>'
                      }
                    </div>
                  </div>
                  ${mapsUrl ? `<a href="${mapsUrl}" class="maps-link">Open in Google Maps</a>` : ''}
                </div>
              `;
            }).join('')}
          </body>
        </html>
      `;

      if (Platform.OS === 'web') {
        await Print.printAsync({ html });
      } else {
        const { uri } = await Print.printToFileAsync({ html });
        await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
      }
    } catch (error) {
      console.error('PDF Export Error:', error);
      Alert.alert('Error', 'Failed to generate PDF export.');
    }
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={styles.title} numberOfLines={2}>
              {start?.name ?? 'Start'} → {end?.name ?? 'End'}
            </Text>
            <Text style={styles.sub}>
              Start {startAt.mode === 'now' ? 'now' : 'at'}: {fmtDateTime(startAt.startAtISO)}
            </Text>
          </View>
          <Pressable style={styles.exportButton} onPress={exportToPdf}>
            <Text style={styles.exportButtonText}>Export PDF</Text>
          </Pressable>
        </View>
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
              const canLink = Boolean(chosenRouteId) && Boolean(from) && Boolean(to);
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

                  {canLink ? (
                    <Pressable
                      style={styles.mapsLinkButton}
                      onPress={async () => {
                        if (!from || !to) return;
                        const url = googleMapsDirectionsUrl({
                          origin: from.location,
                          destination: to.location,
                          travelMode: 'transit',
                          departureTimeISO: r.startAtISO ?? startAt.startAtISO,
                        });
                        const ok = await Linking.canOpenURL(url);
                        if (ok) await Linking.openURL(url);
                      }}
                    >
                      <Text style={styles.mapsLinkText}>Open in Google Maps</Text>
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
  content: { 
    padding: 16, 
    gap: 12,
    maxWidth: 600,
    width: '100%',
    alignSelf: 'center',
  },
  header: { gap: 4 },
  headerTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  exportButton: {
    backgroundColor: '#000',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginLeft: 10,
  },
  exportButtonText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: '700',
  },
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
  mapsLinkButton: {
    marginTop: 10,
  },
  mapsLinkText: { color: '#2563eb', fontWeight: '800' },
});


