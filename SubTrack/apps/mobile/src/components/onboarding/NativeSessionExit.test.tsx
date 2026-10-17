import React from 'react';
import {fireEvent,render,screen} from '@testing-library/react-native';
import {catalogs} from '@subtrack/i18n';
import {NativeSessionExit,sessionExitFeedback} from './NativeSessionExit';
import type {NativePhase} from '@/state/NativeSessionCore';
let mockLocale:'en'|'sv'='en';
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n(mockLocale)}));
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>({...jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false),theme:jest.requireActual('../../../../../packages/ui-tokens/generated/billing-month.native.json')})}));
it.each(['en','sv'] as const)('offers only the exit action appropriate to the current session in %s',locale=>{
 mockLocale=locale;const onExit=jest.fn(),copy=catalogs[locale].onboarding.nativePersonal;
 const view=render(<NativeSessionExit phase="verification-required" onExit={onExit}/>);
 expect(screen.queryAllByRole('button')).toHaveLength(0);
 for(const [phase,key] of [['busy','cancelVerification'],['active','logout'],['storage-error','clearSession']] as const){
  view.rerender(<NativeSessionExit phase={phase} onExit={onExit}/>);
  expect(screen.getAllByRole('button')).toHaveLength(1);
  fireEvent.press(screen.getByRole('button',{name:copy[key]}));
 }
 expect(onExit).toHaveBeenCalledTimes(3);
 view.rerender(<NativeSessionExit phase="verification-required" onExit={onExit}/>);
 expect(screen.queryByRole('button',{name:copy.logout})).toBeNull();
});
it.each<[NativePhase,boolean,string]>([
 ['active',true,'logoutConfirmed'],['active',false,'logoutLocal'],
 ['busy',true,'verificationCancelled'],['busy',false,'verificationCancelled'],
 ['storage-error',true,'sessionCleared'],['storage-error',false,'sessionCleared'],
 ['verification-required',true,''],['verification-required',false,''],
])('uses accurate feedback for %s with server confirmation %s',(phase,confirmed,key)=>{
 expect(sessionExitFeedback(phase,confirmed)).toBe(key);
});
