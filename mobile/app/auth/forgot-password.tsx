import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { supabase } from '@/lib/supabase';

export default function ForgotPasswordScreen() {
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  const handleReset = async () => {
    if (!email.trim()) return;
    setSubmitting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim());
    setSubmitting(false);
    if (error) {
      Alert.alert('Error', error.message);
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={styles.topBar}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="arrow-back" size={24} color="#111b21" />
        </TouchableOpacity>
        <Text style={styles.topTitle}>Reset password</Text>
      </View>

      <View style={styles.body}>
        <Ionicons name="lock-closed-outline" size={56} color="#25D366" style={{ marginBottom: 20 }} />
        {sent ? (
          <>
            <Text style={styles.title}>Check your email</Text>
            <Text style={styles.subtitle}>
              We sent a password reset link to{'\n'}
              <Text style={styles.email}>{email}</Text>
            </Text>
            <TouchableOpacity
              style={[styles.button, styles.buttonSecondary]}
              onPress={() => router.back()}
            >
              <Text style={[styles.buttonText, { color: '#25D366' }]}>Back to sign in</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={styles.title}>Forgot password?</Text>
            <Text style={styles.subtitle}>
              Enter the email linked to your account and we'll send you a reset link.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor="#8696a0"
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TouchableOpacity
              style={[styles.button, (!email.trim() || submitting) && styles.buttonDisabled]}
              onPress={handleReset}
              disabled={!email.trim() || submitting}
            >
              {submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>Send reset link</Text>
              )}
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 10,
  },
  topTitle: { fontSize: 17, fontWeight: '600', color: '#111b21' },
  body: { flex: 1, padding: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#111b21', marginBottom: 8 },
  subtitle: { fontSize: 14.5, color: '#667781', lineHeight: 21, marginBottom: 20 },
  email: { fontWeight: '600', color: '#111b21' },
  input: {
    borderWidth: 1,
    borderColor: '#d1d7db',
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: '#111b21',
    backgroundColor: '#f7f8fa',
    marginBottom: 16,
  },
  button: {
    backgroundColor: '#25D366',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonDisabled: { opacity: 0.5 },
  buttonSecondary: { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: '#25D366', marginTop: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});
