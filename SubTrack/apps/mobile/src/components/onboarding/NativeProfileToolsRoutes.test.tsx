import React from 'react';
import {render,screen} from '@testing-library/react-native';
import PrivacyRoute from '../../../app/personal-privacy';
import HelpRoute from '../../../app/personal-help';
import {useSandboxSession} from '@/state/SandboxSession';
import {sandboxMobileApi} from '@/api/sandboxMobileApi';
let mockSandbox=false;
jest.mock('@/state/SandboxSession',()=>({sandboxBuildSelected:()=>mockSandbox,useSandboxSession:jest.fn()}));
jest.mock('@/api/sandboxMobileApi',()=>({sandboxMobileApi:{readNativeBank:jest.fn()}}));
jest.mock('./NativeProfileTools',()=>({NativePrivacyScreen:(props:object)=>{const {Text}=jest.requireActual('react-native');return <Text testID="privacy" {...props}/>;},NativeHelpScreen:(props:object)=>{const {Text}=jest.requireActual('react-native');return <Text testID="help" {...props}/>;}}));
it('uses production defaults and injects isolated sandbox read authority only into sandbox routes',()=>{
 mockSandbox=false;const production=render(<PrivacyRoute/>);expect(screen.getByTestId('privacy').props.api).toBeUndefined();expect(screen.getByTestId('privacy').props.useSession).toBeUndefined();production.unmount();mockSandbox=true;const sandbox=render(<PrivacyRoute/>);expect(screen.getByTestId('privacy').props.api.readNativeBank).toBe(sandboxMobileApi.readNativeBank);expect(screen.getByTestId('privacy').props.useSession).toBe(useSandboxSession);expect(sandboxMobileApi.readNativeBank).not.toHaveBeenCalled();sandbox.unmount();
 mockSandbox=false;const help=render(<HelpRoute/>);expect(screen.getByTestId('help').props.useSession).toBeUndefined();help.unmount();mockSandbox=true;render(<HelpRoute/>);expect(screen.getByTestId('help').props.useSession).toBe(useSandboxSession);
});
