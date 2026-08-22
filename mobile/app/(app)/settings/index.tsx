import { useEffect, useState } from 'react';
import { Alert, Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, Stack } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/lib/supabase';

export default function SettingsScreen() {
  const { user, signOut } = useAuth();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [profile, setProfile] = useState({ name: '', avatarUrl: '' });

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from('profiles')
        .select('name, avatar_url')
        .eq('user_id', user.id)
        .maybeSingle();
      setProfile({
        name: data?.name || user.user_metadata?.name || '',
        avatarUrl: data?.avatar_url || '',
      });
    })();
  }, [user]);

  const handleSignOut = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          await signOut();
          router.replace('/auth');
        },
      },
    ]);
  };

  const email = user?.email || '';

  return (
    <View style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: true,
          title: 'Settings',
          headerTitleStyle: { fontWeight: '700', fontSize: 20 },
        }}
      />

      {/* Profile card */}
      <View style={styles.profileCard}>
        {profile.avatarUrl ? (
          <Image source={{ uri: profile.avatarUrl }} style={[styles.avatar, styles.avatarImg]} />
        ) : (
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>
              {(profile.name || email).charAt(0).toUpperCase() || '?'}
            </Text>
          </View>
        )}
        <View style={{ flex: 1 }}>
          {!!profile.name && <Text style={styles.name} numberOfLines={1}>{profile.name}</Text>}
          <Text style={styles.email} numberOfLines={1}>{email}</Text>
          <Text style={styles.signedIn}>Signed in</Text>
        </View>
      </View>

      {/* Actions */}
      <TouchableOpacity style={styles.row} onPress={handleSignOut}>
        <Ionicons name="log-out-outline" size={22} color="#e53935" />
        <Text style={[styles.rowText, { color: '#e53935' }]}>Sign out</Text>
      </TouchableOpacity>

      <View style={styles.footerSpace} />
      <Text style={styles.version}>Waaba Mobile v1.0.0</Text>
      <View style={{ height: insets.bottom }} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#fff' },

  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    margin: 12,
    padding: 14,
    borderRadius: 12,
    backgroundColor: '#f0f2f5',
  },
  avatar: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#28A156',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: '#fff', fontSize: 24, fontWeight: '600' },
  avatarImg: { resizeMode: 'cover' },
  name: { fontSize: 16, fontWeight: '600', color: '#111b21' },
  email: { fontSize: 14, color: '#54656f' },
  signedIn: { fontSize: 13, color: '#667781', marginTop: 2 },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  rowText: { fontSize: 15.5 },

  footerSpace: { flex: 1 },
  version: { textAlign: 'center', fontSize: 12, color: '#8696a0', marginBottom: 10 },
});
