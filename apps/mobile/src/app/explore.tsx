import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

export default function DeviceScreen() {
  return (
    <SafeAreaView style={styles.screen}>
      <Text style={styles.eyebrow}>Capabilities</Text>
      <Text style={styles.title}>Mobile backend boundary</Text>
      <View style={styles.panel}>
        <Capability label="Biometric authentication" value="placeholder" />
        <Capability label="Secure pairing" value="placeholder" />
        <Capability label="Device actions" value="placeholder" />
        <Capability label="Notifications" value="placeholder" />
      </View>
    </SafeAreaView>
  );
}

function Capability({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.capability}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    gap: 18,
    padding: 20,
    backgroundColor: '#071018',
  },
  eyebrow: {
    color: '#8fd6b5',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 30,
    fontWeight: '800',
  },
  panel: {
    gap: 10,
  },
  capability: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f3848',
    backgroundColor: '#0d1822',
    padding: 16,
  },
  label: {
    color: '#dbe7ef',
    fontSize: 16,
    fontWeight: '700',
  },
  value: {
    marginTop: 4,
    color: '#8fa3b1',
    fontSize: 13,
    textTransform: 'uppercase',
  },
});
