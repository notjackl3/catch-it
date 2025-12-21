import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  ScrollView
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';

import {
  placesAutocomplete,
  getPlaceDetails,
  type PlaceAutocompletePrediction,
  type PlaceDetails,
} from '../api/google/places';
import { computeRoutes } from '../api/google/routes';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlanTrip'>;

function formatTime(d: Date): string {
    return d.toLocaleTimeString([], {
        day: 'numeric',
        month: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

type StopDraft = {
  id: string;
  text: string;
  place: PlaceDetails | null;
  arriveBy: Date | null; // null for the start stop
  dwellMinutes: number; // used when this stop is the FROM of a leg (i.e. not last)
};

type StartTimeMode = 'now' | 'custom';

function makeId(): string {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function PlanTripScreen() {
  const nav = useNavigation<Nav>();

  const [startTimeMode, setStartTimeMode] = useState<StartTimeMode>('now');
  const [customStartAt, setCustomStartAt] = useState<Date>(new Date());
  const [activeDatePicker, setActiveDatePicker] = useState<
    | { kind: 'start' }
    | { kind: 'stop'; stopIndex: number }
    | null
  >(null);

  const [stops, setStops] = useState<StopDraft[]>(() => [
    { id: makeId(), text: '', place: null, arriveBy: null, dwellMinutes: 0 }, // start
    { id: makeId(), text: '', place: null, arriveBy: new Date(), dwellMinutes: 5 }, // stop 1
  ]);

  const [activeStopIndex, setActiveStopIndex] = useState<number | null>(0);
  const activeText =
    activeStopIndex === null ? '' : (stops[activeStopIndex]?.text ?? '');

  const acQuery = useQuery({
    queryKey: ['placesAutocomplete', 'stop', activeStopIndex, activeText],
    queryFn: () => placesAutocomplete(activeText),
    enabled: activeText.trim().length >= 2 && activeStopIndex !== null,
  });

  const suggestions =
    activeStopIndex === null || stops[activeStopIndex]?.place
      ? []
      : acQuery.data ?? [];

  async function pickSuggestionForStop(stopIndex: number, p: PlaceAutocompletePrediction) {
    const details = await getPlaceDetails(p.placeId);
    setStops((cur) =>
      cur.map((s, idx) =>
        idx === stopIndex ? { ...s, place: details, text: details.address ?? details.name } : s
      )
    );
    setActiveStopIndex(null);
  }

  const canSearch = useMemo(() => {
    if (stops.length < 2) return false;
    if (stops.some((s) => !s.place)) return false;
    // every non-start stop needs arriveBy
    for (let i = 1; i < stops.length; i++) {
      if (!stops[i].arriveBy) return false;
    }
    // dwell applies only to intermediate stops (not start, not last)
    for (let i = 1; i < stops.length - 1; i++) {
      if (!Number.isFinite(stops[i].dwellMinutes) || stops[i].dwellMinutes < 0) return false;
    }
    return true;
  }, [stops]);

  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function addStop() {
    setStops((cur) => [
      ...cur,
      { id: makeId(), text: '', place: null, arriveBy: new Date(), dwellMinutes: 5 },
    ]);
  }

  function removeStop(index: number) {
    setStops((cur) => {
      if (cur.length <= 2) return cur;
      if (index === 0) return cur;
      const next = cur.filter((_, i) => i !== index);
      return next;
    });
    setActiveStopIndex((cur) => {
      if (cur === null) return null;
      if (cur === index) return null;
      return cur > index ? cur - 1 : cur;
    });
  }

  async function onSearch() {
    if (!canSearch) return;
    setSearching(true);
    setError(null);
    try {
      const legs: RootStackParamList['Results']['legs'] = [];
      const startAt = startTimeMode === 'now' ? new Date() : customStartAt;
      for (let i = 0; i < stops.length - 1; i++) {
        const from = stops[i].place!;
        const to = stops[i + 1].place!;
        const arriveBy = stops[i + 1].arriveBy!;
        const dwellMinutesAtFromStop = i === 0 ? 0 : (stops[i].dwellMinutes ?? 5);

        let routes = await computeRoutes({
          origin: from.location,
          destination: to.location,
          timeMode: 'arriveBy',
          time: arriveBy,
        });

        // Apply start time constraint only to the first leg:
        // If a route's computed startAt is before the chosen startAt, hide it.
        if (i === 0) {
          const minStartMs = startAt.getTime();
          routes = routes.filter((r) => {
            const ms = r.startAtISO ? new Date(r.startAtISO).getTime() : NaN;
            return Number.isFinite(ms) ? ms >= minStartMs : true;
          });
        }

        legs.push({
          id: `${i}`,
          fromStopId: stops[i].id,
          toStopId: stops[i + 1].id,
          arriveByISO: arriveBy.toISOString(),
          dwellMinutesAtFromStop,
          routes,
        });
      }

      nav.navigate('Results', {
        startAt: { mode: startTimeMode, startAtISO: startAt.toISOString() },
        stops: stops.map((s, idx) => ({
          id: s.id,
          place: s.place!,
          arriveByISO: idx === 0 ? undefined : s.arriveBy!.toISOString(),
          dwellMinutes: idx === 0 ? undefined : s.dwellMinutes,
        })),
        legs,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to compute routes');
    } finally {
      setSearching(false);
    }
  }

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Start time</Text>

      <View style={styles.row}>
        <Pressable
          style={[styles.pill, startTimeMode === 'now' && styles.pillActive]}
          onPress={() => setStartTimeMode('now')}
        >
          <Text style={startTimeMode === 'now' ? styles.pillTextActive : styles.pillText}>Now</Text>
        </Pressable>
        <Pressable
          style={[styles.pill, startTimeMode === 'custom' && styles.pillActive]}
          onPress={() => setStartTimeMode('custom')}
        >
          <Text style={startTimeMode === 'custom' ? styles.pillTextActive : styles.pillText}>
            Custom
          </Text>
        </Pressable>
      </View>

      {stops.map((s, idx) => {
        const isStart = idx === 0;
        const isLast = idx === stops.length - 1;

        return (
          <View key={s.id} style={styles.stopCard}>
            <View style={styles.stopHeaderRow}>
              <Text style={styles.stopTitle}>{isStart ? 'Start' : `Stop ${idx}`}</Text>
              {!isStart ? (
                <Pressable onPress={() => removeStop(idx)} disabled={stops.length <= 2}>
                  <Text style={[styles.removeText, stops.length <= 2 && styles.removeTextDisabled]}>
                    Remove
                  </Text>
                </Pressable>
              ) : null}
            </View>

            <TextInput
              value={s.text}
              onFocus={() => setActiveStopIndex(idx)}
              onChangeText={(t) => {
                setStops((cur) =>
                  cur.map((x, i) => (i === idx ? { ...x, text: t, place: null } : x))
                );
                setActiveStopIndex(idx);
              }}
              placeholder={isStart ? 'Enter starting place' : 'Enter stop'}
              style={styles.input}
              autoCapitalize="none"
            />

            {startTimeMode === 'custom' ? (
            <Pressable
                  style={styles.timeButton}
                  onPress={() => setActiveDatePicker({ kind: 'stop', stopIndex: idx })}
                >
                  <Text style={styles.timeButtonText}>{formatTime(s.arriveBy ?? new Date())}</Text>
            </Pressable>
            ) : null}

            {activeStopIndex === idx && acQuery.isFetching ? <ActivityIndicator /> : null}
            {activeStopIndex === idx
              ? suggestions.slice(0, 5).map((p) => (
                  <Pressable
                    key={p.placeId}
                    onPress={() => pickSuggestionForStop(idx, p)}
                    style={styles.suggestion}
                  >
                    <Text numberOfLines={2}>{p.description}</Text>
                  </Pressable>
                ))
              : null}

            {!isStart ? (
              <>
                <Text style={styles.label}>Arrive by</Text>
                <Pressable
                  style={styles.timeButton}
                  onPress={() => setActiveDatePicker({ kind: 'stop', stopIndex: idx })}
                >
                  <Text style={styles.timeButtonText}>{formatTime(s.arriveBy ?? new Date())}</Text>
                </Pressable>

                {!isLast ? (
                  <>
                    <Text style={styles.label}>Minutes at this stop</Text>
                    <TextInput
                      value={String(s.dwellMinutes)}
                      onChangeText={(t) => {
                        const n = Number(t.replace(/[^\d]/g, ''));
                        setStops((cur) =>
                          cur.map((x, i) =>
                            i === idx ? { ...x, dwellMinutes: Number.isFinite(n) ? n : 0 } : x
                          )
                        );
                      }}
                      keyboardType="number-pad"
                      placeholder="5"
                      style={styles.input}
                    />
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        );
      })}

      <Pressable style={styles.addButton} onPress={addStop}>
        <Text style={styles.addText}>+ Add stop</Text>
      </Pressable>

      {activeDatePicker ? (
        <DateTimePicker
          value={
            activeDatePicker.kind === 'start'
              ? customStartAt
              : (stops[activeDatePicker.stopIndex]?.arriveBy ?? new Date())
          }
          mode="datetime"
          onChange={(_, d) => {
            const current = activeDatePicker;
            setActiveDatePicker(null);
            if (!d) return;

            if (current.kind === 'start') {
              setCustomStartAt(d);
              return;
            }

            const idx = current.stopIndex;
            setStops((cur) => cur.map((x, i) => (i === idx ? { ...x, arriveBy: d } : x)));
          }}
        />
      ) : null}

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Pressable
        style={[styles.searchButton, !canSearch && styles.searchButtonDisabled]}
        onPress={onSearch}
        disabled={!canSearch || searching}
      >
        {searching ? <ActivityIndicator color="#fff" /> : <Text style={styles.searchText}>Search</Text>}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8, backgroundColor: '#fff' },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  row: { flexDirection: 'row', gap: 10, marginBottom: 8 },
  pill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#111', borderColor: '#111' },
  pillText: { color: '#111' },
  pillTextActive: { color: '#fff' },
  stopCard: { borderWidth: 1, borderColor: '#eee', borderRadius: 12, padding: 12, gap: 8, marginBottom: 20 },
  stopHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  stopTitle: { fontWeight: '800' },
  removeText: { color: '#b00020', fontWeight: '700' },
  removeTextDisabled: { opacity: 0.4 },
  label: { fontSize: 14, fontWeight: '600', marginTop: 8 },
  input: {
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  suggestion: {
    borderWidth: 1,
    borderColor: '#eee',
    borderRadius: 10,
    padding: 10,
    backgroundColor: '#fafafa',
  },
  timeButton: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    marginTop: 6,
  },
  timeButtonText: { fontWeight: '600' },
  addButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#ddd',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginBottom: 12
  },
  addText: { fontWeight: '800' },
  error: { color: '#b00020', marginTop: 6 },
  searchButton: {
    marginTop: 12,
    backgroundColor: '#2563eb',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
  },
  searchButtonDisabled: { opacity: 0.4 },
  searchText: { color: '#fff', fontWeight: '700' },
});


