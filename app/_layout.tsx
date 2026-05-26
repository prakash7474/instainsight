import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

export default function RootLayout() {
    // Expo Router / React Navigation uses useLayoutEffect internally.
    // On SSR/web this triggers a warning and can cause hydration mismatches.
    // Rendering the navigator only after client mount avoids that.
    const [isClient, setIsClient] = useState(false);

    useEffect(() => {
        setIsClient(true);
    }, []);

    if (!isClient) {
        return <GestureHandlerRootView style={{ flex: 1 }} />;
    }

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
                    name="gallery"
                    options={{ title: 'Media Gallery', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                    name="stories"
                    options={{ title: 'Stories', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                    name="userlist"
                    options={{ title: 'User List', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                    name="dna"
                    options={{ title: 'Instagram DNA', headerBackTitle: 'Back' }}
                />
                <Stack.Screen
                    name="zip-viewer-guide"
                    options={{ title: 'ZIP Viewer Guide', headerBackTitle: 'Back' }}
                />
            </Stack>
        </GestureHandlerRootView>
    );
}

