import React from 'react';
import {Text} from 'react-native';
import {fireEvent,render,screen,waitFor} from '@testing-library/react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {I18nProvider,useI18n} from '@/context/I18nContext';
import {ThemeProvider,useTheme} from '@/context/ThemeContext';
import {NativePersonalScreen,type NativeFeatureSession,type NativePersonalApi} from './NativePersonalScreen';
import {catalogs} from '@subtrack/i18n';
import type {ProfileView} from '../../../../../packages/contracts/generated/types.gen';
const mockStored=new Map<string,string>();
jest.mock('@react-native-async-storage/async-storage',()=>({__esModule:true,default:{getItem:jest.fn((key:string)=>Promise.resolve(mockStored.get(key)??null)),setItem:jest.fn((key:string,value:string)=>{mockStored.set(key,value);return Promise.resolve();})}}));
jest.mock('expo-router',()=>({useRouter:()=>({replace:jest.fn(),push:jest.fn()}),useFocusEffect:jest.fn()}));
jest.mock('expo-secure-store',()=>({WHEN_UNLOCKED_THIS_DEVICE_ONLY:6}));
function State(){const {locale}=useI18n(),{mode,isDark}=useTheme();return <Text testID="preferences-state">{`${locale}|${mode}|${isDark}`}</Text>;}
it('changes real translated labels/theme after saved profile readback and restores both on reopening',async()=>{
 mockStored.clear();let profile:ProfileView={displayName:'Example',avatarEmoji:'🙂',avatarColourToken:null,language:'en',theme:'system',defaultCurrency:'SEK',profileComplete:true};
 const api={readNativeProfile:jest.fn(async()=>profile),readNativeMode:jest.fn(async()=>({mode:'just-me'})),readNativeSubscriptions:jest.fn(async()=>({items:[],nextCursor:null})),saveNativeProfile:jest.fn(async(patch:Partial<ProfileView>)=>{profile={...profile,...patch};return {...profile,language:'en',theme:'light'};})} as unknown as NativePersonalApi;
 const session={phase:'active',run:async(operation:(token:string,signal:AbortSignal)=>Promise<unknown>)=>operation('fixture',new AbortController().signal),logout:jest.fn(),login:jest.fn(),refresh:jest.fn()} as unknown as NativeFeatureSession;
 function App(){return <I18nProvider><ThemeProvider><NativePersonalScreen useSession={()=>session} api={api}/><State/></ThemeProvider></I18nProvider>;}
 const view=render(<App/>);await screen.findByRole('button',{name:catalogs.en.onboarding.nativePersonal.savePreferences});
 fireEvent.press(screen.getByRole('button',{name:catalogs.en.preferences.languageName.sv}));fireEvent.press(screen.getByRole('button',{name:catalogs.en.preferences.themes.dark}));fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.nativePersonal.savePreferences}));
 await screen.findByRole('button',{name:catalogs.sv.onboarding.nativePersonal.savePreferences});await waitFor(()=>expect(screen.getByTestId('preferences-state').props.children).toBe('sv|dark|true'));
 expect(api.saveNativeProfile).toHaveBeenCalledWith({language:'sv',theme:'dark'},'fixture',expect.any(AbortSignal));expect(AsyncStorage.setItem).toHaveBeenCalledWith('locale-preference','sv');expect(AsyncStorage.setItem).toHaveBeenCalledWith('theme-mode-preference','dark');
 view.unmount();render(<App/>);await screen.findByRole('button',{name:catalogs.sv.onboarding.nativePersonal.savePreferences});await waitFor(()=>expect(screen.getByTestId('preferences-state').props.children).toBe('sv|dark|true'));
 fireEvent.press(screen.getByRole('button',{name:catalogs.sv.preferences.languageName.en}));fireEvent.press(screen.getByRole('button',{name:catalogs.sv.preferences.themes.light}));fireEvent.press(screen.getByRole('button',{name:catalogs.sv.onboarding.nativePersonal.savePreferences}));await screen.findByRole('button',{name:catalogs.en.onboarding.nativePersonal.savePreferences});await waitFor(()=>expect(screen.getByTestId('preferences-state').props.children).toBe('en|light|false'));
});
