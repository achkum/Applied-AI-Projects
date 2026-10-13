import React from 'react';
import Svg,{Path} from 'react-native-svg';
export function BankIcon({color}:{color:string}){
 return <Svg width={24} height={24} viewBox="0 0 24 24" accessible={false} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round"><Path d="M3 9L12 3L21 9H3ZM5 10V18M10 10V18M14 10V18M19 10V18M3 21H21M3 18H21"/></Svg>;
}
