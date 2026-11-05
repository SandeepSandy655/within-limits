import { Text, View } from 'react-native';
import { router } from 'expo-router';
import { AppIcon, type IconName } from '@/components/AppIcon';
import { Button, Page, colors, ui } from '@/components/ui';
const steps: { icon: IconName; title: string; text: string }[] = [
  { icon: 'wifi', title: '1. Get connected', text: 'Keep internet and your phone’s location services on. Each phone needs its own account.' },
  { icon: 'pair', title: '2. Find your people', text: 'The host opens Pair → Host a group. Companions open Join a group, scan the QR or enter the code, then request to join.' },
  { icon: 'shield', title: '3. Make it your circle', text: 'The host opens Group → Requests, chooses a 1 km or 2 km range for each member, then approves. Four devices total: one host and three companions. Members cannot host other devices.' },
  { icon: 'location', title: '4. Share when you’re ready', text: 'Turn on location sharing from Home, allow location access, and open Map. Keep the app in the foreground on each phone.' },
];
export default function GuideScreen() {
  return <Page><Text style={ui.title}>Your first trip,{"\n"}in four steps.</Text>{steps.map((step) => <View key={step.title} style={[ui.card, ui.row, { alignItems: 'flex-start' }]}><View style={ui.avatar}><AppIcon name={step.icon} color={colors.green} /></View><View style={{ flex: 1, gap: 7 }}><Text style={[ui.heading, { fontSize: 17 }]}>{step.title}</Text><Text style={ui.subtitle}>{step.text}</Text></View></View>)}<View style={ui.notice}><Text style={[ui.body, { fontWeight: '800' }]}>Stay within reach</Text><Text style={ui.small}>Map and Nearby show only connections inside the chosen range with recent, accurate GPS. The host gets an alert when a member goes out of reach. Use Group to contact them, and the bell to read saved notifications.</Text></View><Button title="Let’s pair your group" icon="arrow" onPress={() => router.navigate('/invite')} /></Page>;
}
