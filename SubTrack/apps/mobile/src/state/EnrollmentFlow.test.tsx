let mockDiagnosticChannel:ReturnType<typeof import('@/utils/privateRuntimeEnrollmentDiagnostic').createEnrollmentDiagnosticChannel>|undefined;
jest.mock('@/utils/privateRuntimeEnrollmentDiagnostic',()=>{const actual=jest.requireActual<typeof import('@/utils/privateRuntimeEnrollmentDiagnostic')>('@/utils/privateRuntimeEnrollmentDiagnostic');return {...actual,calibrateEnrollmentDiagnostic:()=>mockDiagnosticChannel?.calibrate()??(()=>{}),observeEnrollmentStage:(stage:import('@/utils/privateRuntimeEnrollmentDiagnostic').EnrollmentDiagnosticStage)=>mockDiagnosticChannel?.observe(stage),beginEnrollmentDiagnostic:()=>mockDiagnosticChannel?.begin()};});
import {calibrateEnrollmentDiagnostic,createEnrollmentDiagnosticChannel,type EnrollmentDiagnostic} from '@/utils/privateRuntimeEnrollmentDiagnostic';
import React from 'react';
import { Pressable, Text } from 'react-native';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react-native';
import { EnrollmentProvider, useEnrollment } from './EnrollmentFlow';
import {
  EnrollmentRequestError,
  startMobileEnrollment,
  verifyMobileEnrollment,
} from '@/api/mobileEnrollmentOtp';

let mockPathname = '/register';
jest.mock('expo-router', () => ({ usePathname: () => mockPathname }));
jest.mock('@/api/mobileEnrollmentOtp', () => ({
  EnrollmentRequestError: class extends Error {
    reason: string;
    constructor(mockReason: string) {
      super(mockReason);
      this.reason = mockReason;
    }
  },
  startMobileEnrollment: jest.fn(),
  verifyMobileEnrollment: jest.fn(),
}));

const identifier = {
  valid: true as const,
  channel: 'email' as const,
  identifier: 'person@example.test',
};
const challengeId = 'a'.repeat(43);
const proof = `v2.${'b'.repeat(43)}`;
const start = jest.mocked(startMobileEnrollment);
const verify = jest.mocked(verifyMobileEnrollment);
let latestAction: Promise<void> | undefined;

function Controls() {
  const { flow, start: begin, resend, verify: check, reset } = useEnrollment();
  return (
    <>
      <Text testID="phase">{flow.phase}</Text>
      {'error' in flow && <Text testID="error">{flow.error}</Text>}
      {'pending' in flow && (
        <Text testID="pending">{String(flow.pending)}</Text>
      )}
      <Pressable
        testID="start"
        onPress={() => void (latestAction = begin(identifier))}
      />
      <Pressable
        testID="resend"
        onPress={() => void (latestAction = resend())}
      />
      <Pressable
        testID="verify"
        onPress={() => void (latestAction = check('123456'))}
      />
      <Pressable testID="reset" onPress={reset} />
    </>
  );
}

function mount() {
  return render(
    <EnrollmentProvider>
      <Controls />
    </EnrollmentProvider>,
  );
}
function phase() {
  return screen.getByTestId('phase').props.children;
}
async function settleAction() {
  await act(async () => {
    await latestAction;
  });
}
async function enterOtp() {
  start.mockResolvedValueOnce({
    challengeId,
    status: 'accepted',
    nextBrowserNonce: null,
  });
  fireEvent.press(screen.getByTestId('start'));
  await settleAction();
  expect(phase()).toBe('otp');
}

describe('in-memory enrollment flow', () => {
  beforeAll(() => {
    // Initialize the shared native renderer before Jest starts a test's timer.
    mount();
    cleanup();
  });
  beforeEach(() => {
    mockPathname = '/register';
    latestAction = undefined;
    jest.clearAllMocks();
  });
  afterEach(() => jest.restoreAllMocks());

  it('starts OTP, limits resend to the cooldown, and holds a restricted proof only in memory', async () => {
    mount();
    await enterOtp();
    expect(start).toHaveBeenCalledWith('email', 'person@example.test');
    fireEvent.press(screen.getByTestId('resend'));
    expect(start).toHaveBeenCalledTimes(1);
    verify.mockResolvedValueOnce({
      purpose: 'enroll_identifier',
      proof,
      nextBrowserNonce: null,
    });
    fireEvent.press(screen.getByTestId('verify'));
    expect(screen.getByTestId('pending').props.children).toBe('true');
    await settleAction();
    expect(phase()).toBe('bankid');
    fireEvent.press(screen.getByTestId('reset'));
    expect(phase()).toBe('identifier');
  });

  it('resends only after the cooldown and resets the cooldown after acceptance', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    mount();
    await enterOtp();
    clock.mockReturnValue(31_001);
    start.mockResolvedValueOnce({
      challengeId: 'c'.repeat(43),
      status: 'accepted',
      nextBrowserNonce: null,
    });
    fireEvent.press(screen.getByTestId('resend'));
    expect(screen.getByTestId('pending').props.children).toBe('true');
    await settleAction();
    expect(phase()).toBe('otp');
    expect(start).toHaveBeenCalledTimes(2);
    fireEvent.press(screen.getByTestId('resend'));
    expect(start).toHaveBeenCalledTimes(2);
  });

  it('returns to a fresh identifier entry when resend fails', async () => {
    const clock = jest.spyOn(Date, 'now').mockReturnValue(1000);
    mount();
    await enterOtp();
    clock.mockReturnValue(31_001);
    start.mockRejectedValueOnce(new EnrollmentRequestError('limited'));
    fireEvent.press(screen.getByTestId('resend'));
    await settleAction();
    expect(phase()).toBe('identifier');
    expect(screen.getByTestId('error').props.children).toBe('limited');
  });

  it('allows an incorrect code in the same challenge and resets other verification failures', async () => {
    mount();
    await enterOtp();
    verify.mockRejectedValueOnce(new EnrollmentRequestError('incorrect'));
    fireEvent.press(screen.getByTestId('verify'));
    await settleAction();
    expect(phase()).toBe('otp');
    expect(screen.getByTestId('error').props.children).toBe('incorrect');
    verify.mockRejectedValueOnce(new EnrollmentRequestError('restart'));
    fireEvent.press(screen.getByTestId('verify'));
    await settleAction();
    expect(phase()).toBe('identifier');
  });

  it('discards a late start response after reset', async () => {
    let resolve!: (value: {
      challengeId: string;
      status: 'accepted';
      nextBrowserNonce: null;
    }) => void;
    start.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    mount();
    fireEvent.press(screen.getByTestId('start'));
    expect(phase()).toBe('starting');
    fireEvent.press(screen.getByTestId('reset'));
    await act(async () =>
      resolve({ challengeId, status: 'accepted', nextBrowserNonce: null }),
    );
    expect(phase()).toBe('identifier');
  });

  it('clears a late proof when leaving enrollment by navigation', async () => {
    const view = mount();
    await enterOtp();
    let resolve!: (value: {
      purpose: 'enroll_identifier';
      proof: string;
      nextBrowserNonce: null;
    }) => void;
    verify.mockImplementationOnce(
      () =>
        new Promise((r) => {
          resolve = r;
        }),
    );
    fireEvent.press(screen.getByTestId('verify'));
    mockPathname = '/welcome';
    view.rerender(
      <EnrollmentProvider>
        <Controls />
      </EnrollmentProvider>,
    );
    expect(phase()).toBe('identifier');
    await act(async () =>
      resolve({ purpose: 'enroll_identifier', proof, nextBrowserNonce: null }),
    );
    expect(phase()).toBe('identifier');
  });

  it('discards proof on native back navigation from BankID to OTP', async () => {
    mockPathname = '/register-otp';
    const view = mount();
    await enterOtp();
    verify.mockResolvedValueOnce({
      purpose: 'enroll_identifier',
      proof,
      nextBrowserNonce: null,
    });
    fireEvent.press(screen.getByTestId('verify'));
    await settleAction();
    expect(phase()).toBe('bankid');
    mockPathname = '/register-bankid';
    view.rerender(
      <EnrollmentProvider>
        <Controls />
      </EnrollmentProvider>,
    );
    mockPathname = '/register-otp';
    view.rerender(
      <EnrollmentProvider>
        <Controls />
      </EnrollmentProvider>,
    );
    expect(phase()).toBe('identifier');
  });
});


test('owned opaque start observer is passive and reset fences late client stages and results',async()=>{
 const log=jest.spyOn(console,'info').mockImplementation(()=>{});mockDiagnosticChannel=createEnrollmentDiagnosticChannel(()=>({development:true,platform:'ios',proof:'true',enabled:'true',url:'https://localhost:3443'}),fixed=>console.info(fixed));const close=calibrateEnrollmentDiagnostic();
 try{mockPathname='/register';start.mockClear();let resolve:(value:{challengeId:string;status:'accepted';nextBrowserNonce:null})=>void=()=>{};start.mockImplementationOnce(()=>new Promise(accept=>{resolve=accept;}));mount();fireEvent.press(screen.getByTestId('start'));const observer=start.mock.calls[0]?.[2] as EnrollmentDiagnostic;expect(start).toHaveBeenCalledTimes(1);expect(observer).toBeDefined();observer.stage('fetch-entered');fireEvent.press(screen.getByTestId('start'));expect(start).toHaveBeenCalledTimes(1);expect(log).toHaveBeenLastCalledWith('ST244_ENROLLMENT stage=start-ignored');fireEvent.press(screen.getByTestId('reset'));observer.stage('response-accepted');await act(async()=>resolve({challengeId,status:'accepted',nextBrowserNonce:null}));expect(phase()).toBe('identifier');expect(log.mock.calls.map(([line])=>line)).toEqual(['ST244_ENROLLMENT calibration=mounted','ST244_ENROLLMENT stage=start-accepted','ST244_ENROLLMENT stage=fetch-entered','ST244_ENROLLMENT stage=start-ignored']);}
 finally{close();mockDiagnosticChannel=undefined;log.mockRestore();}
});
