import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { Platform } from 'react-native';

export const decorativeSvgProps = Platform.OS === 'web'
  ? { 'aria-hidden': true as const, focusable: false }
  : { accessible: false };
export type IconName = 'home' | 'map' | 'pair' | 'group' | 'account' | 'menu' | 'close' | 'arrow' | 'bell' | 'location' | 'shield' | 'wifi' | 'check' | 'scan' | 'copy' | 'share' | 'logout' | 'help' | 'refresh' | 'plus' | 'chevron' | 'pause' | 'compass' | 'chat';
const paths: Partial<Record<IconName, string>> = {
  chat: 'M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l-2 2V11.5a9.5 9.5 0 0 1 19 0ZM7 9h10M7 13h7',
  home: 'M3 10 12 3l9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z',
  map: 'm9 3 6 3 6-3v15l-6 3-6-3-6 3V6Zm0 0v15M15 6v15',
  group: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75',
  menu: 'M4 6h16M4 12h11M4 18h16', close: 'm6 6 12 12M6 18 18 6',
  arrow: 'M4 12h16m-6-6 6 6-6 6', chevron: 'm9 5 7 7-7 7',
  bell: 'M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4',
  location: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z',
  shield: 'm12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6Zm-4 9 3 3 5-6',
  wifi: 'M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 16a5.5 5.5 0 0 1 7 0M12 20h.01',
  check: 'm5 12 4 4L19 6', scan: 'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5M7 12h10',
  copy: 'M8 8h12v13H8ZM16 8V3H3v13h5', share: 'M12 16V3m-4 4 4-4 4 4M5 12H3v9h18v-9h-2',
  logout: 'M9 21H3V3h6m6 5 4 4-4 4M7 12h12',
  refresh: 'M20 7v5h-5M4 17v-5h5M5.5 7a8 8 0 0 1 13-2L20 7M4 17l1.5 2a8 8 0 0 0 13-2',
  plus: 'M12 5v14M5 12h14', pause: 'M8 5v14M16 5v14', compass: 'm16 8-3 5-5 3 3-5Z',
};
export function AppIcon({ name, size = 22, color = '#172B3A', strokeWidth = 1.8 }: { name: IconName; size?: number; color?: string; strokeWidth?: number }) {
  return <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round" {...decorativeSvgProps}>
    {paths[name] && <Path d={paths[name]} />}
    {name === 'group' && <Circle cx="9" cy="7" r="4" />}
    {name === 'location' && <Circle cx="12" cy="10" r="2.5" />}
    {name === 'account' && <><Circle cx="12" cy="8" r="4" /><Path d="M4 21v-2a8 8 0 0 1 16 0v2" /></>}
    {name === 'pair' && <><Rect x="3" y="3" width="6" height="6" rx="1" /><Rect x="15" y="3" width="6" height="6" rx="1" /><Rect x="3" y="15" width="6" height="6" rx="1" /><Path d="M15 15h3v3h3m-6 3h3m3-6v-3" /></>}
    {name === 'help' && <><Circle cx="12" cy="12" r="9" /><Path d="M9.1 9a3 3 0 0 1 5.8 1c0 2-3 2-3 4m.1 3h.01" /></>}
    {name === 'compass' && <Circle cx="12" cy="12" r="9" />}
  </Svg>;
}
