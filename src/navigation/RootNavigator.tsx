import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import type { RootStackParamList } from './types';
import { PlanTripScreen } from '../screens/PlanTripScreen';
import { ResultsScreen } from '../screens/ResultsScreen';

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen name="PlanTrip" component={PlanTripScreen} options={{ title: 'Catch-It' }} />
        <Stack.Screen name="Results" component={ResultsScreen} options={{ title: 'Routes' }} />
      </Stack.Navigator>
    </NavigationContainer>
  );
}


