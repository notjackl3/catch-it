import type { PlaceDetails } from '../api/google/places';
import type { RouteOption } from '../api/google/routes';

export type RootStackParamList = {
  PlanTrip: undefined;
  Results: {
    startAt: {
      mode: 'now' | 'custom';
      startAtISO: string;
    };
    stops: Array<{
      id: string;
      place: PlaceDetails;
      arriveByISO?: string; // undefined for the first stop (start)
      dwellMinutes?: number; // only used when there is a next leg
    }>;
    legs: Array<{
      id: string;
      fromStopId: string;
      toStopId: string;
      arriveByISO: string;
      dwellMinutesAtFromStop: number;
      routes: RouteOption[];
    }>;
  };
};


