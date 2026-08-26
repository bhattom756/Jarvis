import { toErrorEnvelope } from '@jarvis/errors';
import type { PropsWithChildren } from 'react';
import { Component } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

interface State {
  error: Error | null;
}

export class GlobalErrorBoundary extends Component<PropsWithChildren, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error(JSON.stringify({ scope: 'mobile:error-boundary', error: toErrorEnvelope(error) }));
  }

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <View style={styles.container}>
        <Text style={styles.eyebrow}>JARVIS Mobile</Text>
        <Text style={styles.title}>Something failed.</Text>
        <Text style={styles.message}>{this.state.error.message}</Text>
        <Pressable style={styles.button} onPress={() => this.setState({ error: null })}>
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      </View>
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    gap: 12,
    padding: 24,
    backgroundColor: '#071018',
  },
  eyebrow: {
    color: '#8fd6b5',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: '#ffffff',
    fontSize: 28,
    fontWeight: '700',
  },
  message: {
    color: '#b8c1cc',
    fontSize: 15,
    lineHeight: 22,
  },
  button: {
    alignSelf: 'flex-start',
    borderRadius: 8,
    backgroundColor: '#8fd6b5',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  buttonText: {
    color: '#071018',
    fontWeight: '700',
  },
});

