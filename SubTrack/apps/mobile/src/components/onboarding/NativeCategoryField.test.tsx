import React from 'react';
import {Keyboard} from 'react-native';
import {fireEvent,render,screen} from '@testing-library/react-native';
import {NativeCategoryField} from './NativeCategoryField';
import {catalogs} from '@subtrack/i18n';
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false)}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
it('hides suggestions on blur while retaining the entered category',()=>{
 const change=jest.fn();render(<NativeCategoryField value="" onChange={change}/>);
 const input=screen.getByTestId('native-subscription-category');fireEvent.changeText(input,'Craft supplies');
 expect(screen.getAllByRole('button')).toHaveLength(1);fireEvent(input,'blur');expect(screen.queryAllByRole('button')).toHaveLength(0);
 expect(input.props.value).toBe('Craft supplies');expect(change).toHaveBeenLastCalledWith('CUSTOM:Craft supplies');
 fireEvent(input,'focus');expect(screen.getAllByRole('button')).toHaveLength(1);
});
it('dismisses the keyboard before committing a selected category',()=>{
 const change=jest.fn(),dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{expect(change).not.toHaveBeenCalled();});
 try{render(<NativeCategoryField value="VIDEO_STREAMING" onChange={change}/>);fireEvent(screen.getByTestId('native-subscription-category'),'focus');
 fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.ownerSubscriptions.category.VIDEO_STREAMING}));
 expect(dismiss).toHaveBeenCalledTimes(1);expect(change).toHaveBeenCalledWith('VIDEO_STREAMING');expect(screen.queryAllByRole('button')).toHaveLength(0);}finally{dismiss.mockRestore();}
});
it('shows matching suggestions rather than every category',()=>{
 const change=jest.fn();render(<NativeCategoryField value="" onChange={change}/>);
 expect(screen.queryByRole('button',{name:catalogs.en.onboarding.ownerSubscriptions.category.GAMING})).toBeNull();
 fireEvent.changeText(screen.getByTestId('native-subscription-category'),'Music');
 fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.ownerSubscriptions.category.MUSIC_AUDIO}));expect(change).toHaveBeenLastCalledWith('MUSIC_AUDIO');
});
it('retains a new category in an explicit persisted namespace',()=>{
 const change=jest.fn();render(<NativeCategoryField value="" onChange={change}/>);
 fireEvent.changeText(screen.getByTestId('native-subscription-category'),'Craft supplies');expect(change).toHaveBeenLastCalledWith('CUSTOM:Craft supplies');
});
it('shows a saved custom label and rejects control text without retaining the old choice',()=>{
 const change=jest.fn();render(<NativeCategoryField value="CUSTOM:Craft supplies" onChange={change}/>);
 expect(screen.getByTestId('native-subscription-category').props.value).toBe('Craft supplies');
 fireEvent.changeText(screen.getByTestId('native-subscription-category'),'Bad\u0000value');expect(change).toHaveBeenLastCalledWith('');
});
