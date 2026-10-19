import React from 'react';
import {render,screen} from '@testing-library/react-native';
import HouseholdRoute from '../../../app/personal-household';
import {sandboxAnalyticsReader} from '@/api/nativeAnalyticsAdapters';
import {useSandboxSession} from '@/state/SandboxSession';
import {useNativeSession} from '@/state/NativeSession';
let mockSandbox=false;
jest.mock('@/state/SandboxSession',()=>({sandboxBuildSelected:()=>mockSandbox,useSandboxSession:jest.fn()}));
jest.mock('@/state/NativeSession',()=>({useNativeSession:jest.fn()}));
jest.mock('@/api/nativeAnalyticsAdapters',()=>({sandboxAnalyticsReader:jest.fn()}));
jest.mock('expo-router',()=>({Redirect:()=>null}));
jest.mock('./NativeHouseholdScreen',()=>({NativeHouseholdScreen:(props:object)=>{const {Text}=jest.requireActual('react-native');return <Text testID="household-route" {...props}/>;}}));
it('injects the existing owner analytics reader only into the isolated sandbox household route',()=>{
 const production=render(<HouseholdRoute/>);expect(screen.getByTestId('household-route').props.useSession).toBe(useNativeSession);expect(screen.getByTestId('household-route').props.detailReader).toBeUndefined();production.unmount();
 mockSandbox=true;render(<HouseholdRoute/>);expect(screen.getByTestId('household-route').props.useSession).toBe(useSandboxSession);expect(screen.getByTestId('household-route').props.detailReader).toBe(sandboxAnalyticsReader);expect(sandboxAnalyticsReader).not.toHaveBeenCalled();
});
