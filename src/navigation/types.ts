import type { PlaceDetails } from '../api/google/places';
import type { RouteOption, TimeMode } from '../api/google/routes';

export type RootStackParamList = {
  PlanTrip: undefined;
  Results: {
    origin: PlaceDetails;
    destination: PlaceDetails;
    timeMode: TimeMode;
    timeISO: string;
    routes: RouteOption[];
  };
};


