import React from 'react';
import {Keyboard,TextInput} from 'react-native';
import {fireEvent,render,screen} from '@testing-library/react-native';
import {NativeDatePicker} from './NativeDatePicker';
import {catalogs} from '@subtrack/i18n';
jest.mock('@/context/ThemeContext',()=>({useTheme:()=>jest.requireActual('../signature/testUtils/contextMocks').makeTheme(false)}));
jest.mock('@/context/I18nContext',()=>({useI18n:()=>jest.requireActual('../signature/testUtils/contextMocks').makeI18n('en')}));
it('dismisses the focused keyboard before opening the calendar modal',()=>{
 const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{expect(screen.queryByTestId('native-date-2026-10-17')).toBeNull();});
 try{render(<NativeDatePicker label="Renewal" value="2026-10-17" onChange={jest.fn()}/>);fireEvent.press(screen.getByRole('button',{name:'Renewal'}));expect(dismiss).toHaveBeenCalledTimes(1);expect(screen.getByTestId('native-date-2026-10-17')).toBeTruthy();}finally{dismiss.mockRestore();}
});
it('selects actual leap-day without exposing a free-form date input',()=>{
 const change=jest.fn();render(<NativeDatePicker label="Renewal" value="2024-02-12" onChange={change}/>);
 expect(screen.UNSAFE_queryByType(TextInput)).toBeNull();fireEvent.press(screen.getByRole('button',{name:'Renewal'}));
 expect(screen.getByRole('button',{name:'2024-02-29'})).toBeTruthy();expect(screen.queryByRole('button',{name:'2024-02-30'})).toBeNull();
 fireEvent.press(screen.getByRole('button',{name:'2024-02-29'}));expect(change).toHaveBeenCalledWith('2024-02-29');
 expect(screen.queryByRole('button',{name:'2024-02-29'})).toBeNull();
});
it('navigates month boundaries and clears an optional date explicitly',()=>{
 const change=jest.fn();render(<NativeDatePicker label="Renewal" value="2026-12-12" onChange={change}/>);
 fireEvent.press(screen.getByRole('button',{name:'Renewal'}));fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.billingMonth.next}));
 expect(screen.getByRole('button',{name:'2027-01-01'})).toBeTruthy();fireEvent.press(screen.getByRole('button',{name:catalogs.en.onboarding.datePicker.clear}));expect(change).toHaveBeenCalledWith('');
});
it('does not open or mutate when disabled',()=>{
 const dismiss=jest.spyOn(Keyboard,'dismiss').mockImplementation(()=>{});
 try{const change=jest.fn();render(<NativeDatePicker label="Renewal" value="2026-10-17" onChange={change} disabled/>);
 fireEvent.press(screen.getByRole('button',{name:'Renewal'}));expect(screen.queryByRole('button',{name:'2026-10-18'})).toBeNull();expect(change).not.toHaveBeenCalled();expect(dismiss).not.toHaveBeenCalled();}finally{dismiss.mockRestore();}
});
