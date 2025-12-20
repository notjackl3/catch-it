import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import DateTimePicker from '@react-native-community/datetimepicker';

import { placesAutocomplete, getPlaceDetails, type PlaceAutocompletePrediction, type PlaceDetails } from '../api/google/places';
import { computeRoutes, type TimeMode } from '../api/google/routes';
import type { RootStackParamList } from '../navigation/types';

type Nav = NativeStackNavigationProp<RootStackParamList, 'PlanTrip'>;

function formatTime(d: Date): string {
  return d.toLocaleString();
}

export function PlanTripScreen() {
  const nav = useNavigation<Nav>();

  const [originText, setOriginText] = useState('');
  const [destText, setDestText] = useState('');
  const [originPicked, setOriginPicked] = useState<PlaceDetails | null>(null);
  const [destPicked, setDestPicked] = useState<PlaceDetails | null>(null);

  const [timeMode, setTimeMode] = useState<TimeMode>('departAt');
  const [time, setTime] = useState<Date>(new Date());
  const [showPicker, setShowPicker] = useState(false);

  const originQuery = useQuery({
    queryKey: ['placesAutocomplete', 'origin', originText],
    queryFn: () => placesAutocomplete(originText),
    enabled: originText.trim().length >= 2,
  });

  const destQuery = useQuery({
    queryKey: ['placesAutocomplete', 'dest', destText],
    queryFn: () => placesAutocomplete(destText),
    enabled: destText.trim().length >= 2,
  });

  const originSuggestions = originPicked ? [] : originQuery.data ?? [];
  const destSuggestions = destPicked ? [] : destQuery.data ?? [];

  async function pickOrigin(p: PlaceAutocompletePrediction) {
    const details = await getPlaceDetails(p.placeId);
    setOriginPicked(details);
    setOriginText(details.address ?? details.name);
  }

  async function pickDest(p: PlaceAutocompletePrediction) {
    const details = await getPlaceDetails(p.placeId);
    setDestPicked(details);
    setDestText(details.address ?? details.name);
  }

  const canSearch = useMemo(() => Boolean(originPicked && destPicked), [originPicked, destPicked]);

  const [searching, setSearching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSearch() {
    if (!originPicked || !destPicked) return;
    setSearching(true);
    setError(null);
    try {
      const routes = await computeRoutes({
        origin: originPicked.location,
        destination: destPicked.location,
        timeMode,
        time,
      });

      nav.navigate('Results', {
        origin: originPicked,
        destination: destPicked,
        timeMode,
        timeISO: time.toISOString(),
        routes,
      });
    } catch (e: any) {
      setError(e?.message ?? 'Failed to compute routes');
    } finally {
      setSearching(false);
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.label}>From</Text>
      <TextInput
        value={originText}
        onChangeText={(t) => {
          setOriginText(t);
          setOriginPicked(null);
        }}
        placeholder="Enter origin"
        style={styles.input}
        autoCapitalize="none"
      />
      {originQuery.isFetching ? <ActivityIndicator /> : null}
      {originSuggestions.slice(0, 5).map((s) => (
        <Pressable key={s.placeId} onPress={() => pickOrigin(s)} style={styles.suggestion}>
          <Text numberOfLines={2}>{s.description}</Text>
        </Pressable>
      ))}

      <Text style={styles.label}>To</Text>
      <TextInput
        value={destText}
        onChangeText={(t) => {
          setDestText(t);
          setDestPicked(null);
        }}
        placeholder="Enter destination"
        style={styles.input}
        autoCapitalize="none"
      />
      {destQuery.isFetching ? <ActivityIndicator /> : null}
      {destSuggestions.slice(0, 5).map((s) => (
        <Pressable key={s.placeId} onPress={() => pickDest(s)} style={styles.suggestion}>
          <Text numberOfLines={2}>{s.description}</Text>
        </Pressable>
      ))}

      <View style={styles.row}>
        <Pressable
          style={[styles.pill, timeMode === 'departAt' && styles.pillActive]}
          onPress={() => setTimeMode('departAt')}
        >
          <Text style={timeMode === 'departAt' ? styles.pillTextActive : styles.pillText}>
            Depart at
          </Text>
        </Pressable>
        <Pressable
          style={[styles.pill, timeMode === 'arriveBy' && styles.pillActive]}
          onPress={() => setTimeMode('arriveBy')}
        >
          <Text style={timeMode === 'arriveBy' ? styles.pillTextActive : styles.pillText}>
            Arrive by
          </Text>
        </Pressable>
      </View>

      <Pressable style={styles.timeButton} onPress={() => setShowPicker(true)}>
        <Text style={styles.timeButtonText}>{formatTime(time)}</Text>
      </Pressable>

      {showPicker ? (
        <DateTimePicker
          value={time}
          mode="datetime"
          onChange={(_, d) => {
            setShowPicker(false);
            if (d) setTime(d);
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16, gap: 8, backgroundColor: '#fff' },
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
  row: { flexDirection: 'row', gap: 10, marginTop: 12 },
  pill: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
  },
  pillActive: { backgroundColor: '#111', borderColor: '#111' },
  pillText: { color: '#111' },
  pillTextActive: { color: '#fff' },
  timeButton: {
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#ddd',
    alignItems: 'center',
    marginTop: 6,
  },
  timeButtonText: { fontWeight: '600' },
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


