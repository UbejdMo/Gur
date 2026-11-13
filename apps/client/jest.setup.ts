// Screens read the safe-area insets (notch, rounded corners). In the app Expo Router provides
// them; in tests the library's own mock stands in, with no insets.
jest.mock(
  'react-native-safe-area-context',
  () => jest.requireActual<{ default: unknown }>('react-native-safe-area-context/jest/mock').default,
);
