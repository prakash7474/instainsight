import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
    return (
        <GestureHandlerRootView style={{ flex: 1 }}>
            <StatusBar style="light" />
            <Stack
                screenOptions={{
                    headerStyle: { backgroundColor: '#0F0F1A' },
                    headerTintColor: '#E040FB',
                    headerTitleStyle: { fontWeight: '700', color: '#FFFFFF' },
                    contentStyle: { backgroundColor: '#0F0F1A' },
                    animation: 'slide_from_right',
                }}
            >
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen
                    name="upload"
                    options={{ title: 'Import Data', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                    name="get-data"
                    options={{ title: 'Get Instagram Data', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                    name="dashboard"
                    options={{ title: 'Dashboard', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                    name="userlist"
                    options={{ title: 'User List', headerBackTitle: 'Back' }}
                />
            </Stack>
        </GestureHandlerRootView>
    );
}
