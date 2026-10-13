import React from 'react';
import Svg,{Path,Rect,Line} from 'react-native-svg';
export function BillingIcon({name,color,size=24}:{name:'previous'|'next'|'close'|'calendar'|'refresh'|'manage'|'logout';color:string;size?:number}){
 const paths={previous:'M15 6L9 12L15 18',next:'M9 6L15 12L9 18',close:'M6 6L18 18M18 6L6 18',refresh:'M20 7V3M20 3H16M20 3L16 7M20 12A8 8 0 1 1 12 4',manage:'M4 6H20M4 12H20M4 18H20',logout:'M10 4H4V20H10M10 12H21M17 8L21 12L17 16',calendar:''};
 return <Svg width={size} height={size} viewBox="0 0 24 24" accessible={false} stroke={color} strokeWidth={1.6} fill="none" strokeLinecap="round" strokeLinejoin="round">
  {name==='calendar'?<><Rect x={4} y={5} width={16} height={16} rx={2}/><Line x1={8} y1={3} x2={8} y2={7}/><Line x1={16} y1={3} x2={16} y2={7}/><Line x1={4} y1={10} x2={20} y2={10}/></>:<Path d={paths[name]}/>}</Svg>;
}
