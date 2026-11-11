import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const finishes = [
  { name: 'White Shaker', material: 'MDF', notes: 'Classic framed door style.' },
  { name: 'Natural Oak', material: 'Wood', notes: 'Natural finish with a Shaker profile.' },
  { name: 'Brushed Aluminum', material: 'Aluminum', notes: 'Slab profile for outdoor planning.' },
];
export default function Home() {
  const [search, setSearch] = useState('');
  const visible = finishes.filter(item => `${item.name} ${item.material}`.toLowerCase().includes(search.trim().toLowerCase()));
  return <SafeAreaView style={s.safe}><ScrollView contentContainerStyle={s.body} keyboardShouldPersistTaps="handled">
    <Text style={s.title}>RTA Cabinets</Text>
    <Text style={s.label}>Offline planning preview</Text>
    <Text style={s.text}>Explore sample finishes from the demo catalog. This is not live inventory, a price quote, or an ordering service.</Text>
    <TextInput style={s.input} accessibilityLabel="Search sample finishes" placeholder="Search finishes or materials" placeholderTextColor="#a5bbce" value={search} onChangeText={setSearch} />
    {visible.map(item => <View key={item.name} style={s.card}><Text style={s.label}>{item.name}</Text><Text style={s.text}>{item.material} · {item.notes}</Text></View>)}
    {visible.length === 0 && <Text accessibilityLiveRegion="polite" style={s.text}>No sample finishes match. Try oak, white, or aluminum.</Text>}
    <View style={s.card}><Text style={s.label}>Before requesting a quote</Text><Text style={s.text}>Measure wall lengths, ceiling height, door and window openings, and appliance dimensions. Confirm measurements and product availability with a supplier before ordering.</Text></View>
    <Text style={s.text}>No account is needed. Search text stays on this device for this session. Checkout and payments are unavailable.</Text>
  </ScrollView></SafeAreaView>;
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: '#0b1625' },
  body: { padding: 24, gap: 16 },
  title: { color: '#fff', fontSize: 30, fontWeight: '700' },
  text: { color: '#dce6f0', fontSize: 16, lineHeight: 24 },
  label: { color: '#f4ca83', fontSize: 16, fontWeight: '600' },
  card: { padding: 18, gap: 10, backgroundColor: '#172b40', borderRadius: 12 },
  input: { color: '#fff', borderColor: '#a5bbce', borderWidth: 1, borderRadius: 8, padding: 12, fontSize: 16 },
});
