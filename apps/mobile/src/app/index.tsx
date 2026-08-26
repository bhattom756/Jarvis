import { toErrorEnvelope } from '@jarvis/errors';
import type { SystemStatus } from '@jarvis/shared-types';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { jarvisApi, jarvisBackendUrls } from '@/lib/jarvis-api';

type ConnectionState = 'checking' | 'online' | 'offline';

export default function HomeScreen() {
  const [connection, setConnection] = useState<ConnectionState>('checking');
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  async function refresh() {
    setConnection('checking');
    setLastError(null);
    try {
      await jarvisApi.health();
      const timeline = await fetch(`${jarvisBackendUrls.httpUrl}/timeline`).then((response) => response.json());
      setStatus(timeline.system?.[0]?.payload ?? null);
      setConnection('online');
    } catch (error) {
      const envelope = toErrorEnvelope(error);
      console.error(JSON.stringify({ scope: 'mobile:connection', error: envelope }));
      setConnection('offline');
      setLastError(envelope.message);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <SafeAreaView style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.eyebrow}>JARVIS Mobile</Text>
        <Text style={styles.title}>Device agent shell</Text>
        <Text style={styles.subtitle}>
          Mobile is initialized for shared protocol access, biometric pairing work, and device capability adapters.
        </Text>
      </View>

      <View style={styles.panel}>
        <View style={styles.row}>
          <Text style={styles.label}>Core service</Text>
          <Text style={[styles.badge, connection === 'online' ? styles.online : styles.offline]}>
            {connection}
          </Text>
        </View>
        <Text style={styles.value}>{jarvisBackendUrls.httpUrl}</Text>
        {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
      </View>

      <View style={styles.grid}>
        <StatusTile label="Microphone" value={status?.microphone ?? 'pending'} />
        <StatusTile label="Memory" value={status?.memory_db ?? 'pending'} />
        <StatusTile label="Pairing" value="not paired" />
        <StatusTile label="Capabilities" value="scaffolded" />
      </View>

      <Pressable style={styles.button} onPress={() => void refresh()}>
        <Text style={styles.buttonText}>Refresh</Text>
      </Pressable>
    </SafeAreaView>
  );
}

function StatusTile({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tile}>
      <Text style={styles.tileLabel}>{label}</Text>
      <Text style={styles.tileValue}>{value}</Text>
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
  header: {
    gap: 10,
    paddingTop: 16,
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
    fontSize: 34,
    fontWeight: '800',
  },
  subtitle: {
    color: '#b8c1cc',
    fontSize: 16,
    lineHeight: 23,
  },
  panel: {
    gap: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#1f3848',
    backgroundColor: '#0d1822',
    padding: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  label: {
    color: '#dbe7ef',
    fontSize: 16,
    fontWeight: '700',
  },
  value: {
    color: '#8fa3b1',
    fontSize: 13,
  },
  badge: {
    overflow: 'hidden',
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    color: '#061015',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
  },
  online: {
    backgroundColor: '#8fd6b5',
  },
  offline: {
    backgroundColor: '#f7887c',
  },
  error: {
    color: '#f7887c',
    fontSize: 13,
    lineHeight: 19,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  tile: {
    minWidth: '47%',
    flexGrow: 1,
    gap: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#193241',
    backgroundColor: '#0b141d',
    padding: 14,
  },
  tileLabel: {
    color: '#8fa3b1',
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tileValue: {
    color: '#f4f8fb',
    fontSize: 16,
    fontWeight: '700',
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#8fd6b5',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  buttonText: {
    color: '#071018',
    fontWeight: '800',
  },
});
