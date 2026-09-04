import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { useAuth } from '@/context/AuthProvider';
import { colors, fonts } from '@/lib/theme';

const PLANNING_ROLES = ['mgmt', 'sales', 'werfleider'];

export default function TabsLayout() {
  const { profile } = useAuth();
  const canSeePlanning = !!profile && PLANNING_ROLES.includes(profile.role);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: { backgroundColor: colors.navy, borderTopColor: colors.ink, height: 60 },
        tabBarActiveTintColor: colors.white,
        tabBarInactiveTintColor: colors.navyText,
        tabBarLabelStyle: {
          fontFamily: fonts.monoMedium,
          fontSize: 10,
          letterSpacing: 0.6,
          textTransform: 'uppercase',
        },
      }}>
      <Tabs.Screen
        name="werven"
        options={{ title: 'Werven', tabBarIcon: ({ color, size }) => <Ionicons name="business" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="chat"
        options={{ title: 'Chat', tabBarIcon: ({ color, size }) => <Ionicons name="chatbubbles" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="magazijn"
        options={{ title: 'Magazijn', tabBarIcon: ({ color, size }) => <Ionicons name="cube" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="plannen"
        options={{ title: 'Plannen', tabBarIcon: ({ color, size }) => <Ionicons name="document-text" color={color} size={size} /> }}
      />
      <Tabs.Protected guard={canSeePlanning}>
        <Tabs.Screen
          name="planning"
          options={{ title: 'Planning', tabBarIcon: ({ color, size }) => <Ionicons name="calendar" color={color} size={size} /> }}
        />
      </Tabs.Protected>
      <Tabs.Screen
        name="todo"
        options={{ title: 'To do', tabBarIcon: ({ color, size }) => <Ionicons name="checkbox" color={color} size={size} /> }}
      />
      <Tabs.Screen
        name="meer"
        options={{ title: 'Meer', tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal" color={color} size={size} /> }}
      />
    </Tabs>
  );
}
