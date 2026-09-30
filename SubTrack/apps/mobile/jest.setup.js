// React Native 0.74 added DebuggingOverlayNativeComponent with $ReadOnlyArray Flow-typed
// props. @testing-library/react-native's detectHostComponentNames iterates all native
// component ViewManagers and throws "Unsupported param type … $ReadOnlyArray" when it
// encounters this component's prop descriptors.
//
// Upstream issue: https://github.com/callstack/react-native-testing-library/issues/1684
// Fix: mock the component so host-component detection skips its props entirely.
// This is belt-and-suspenders on top of the 12.4.3 pin; removing the mock once RNTL
// ships a upstream fix is safe — the pin already prevents the crash at install time.
jest.mock(
  'react-native/Libraries/Debugging/DebuggingOverlayNativeComponent',
  () => ({
    __esModule: true,
    default: 'RCTDebuggingOverlay',
    Commands: {},
  }),
);
