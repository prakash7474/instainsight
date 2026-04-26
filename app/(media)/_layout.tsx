import { Tabs, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useCallback } from 'react';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { processInstagramData } from '../../src/utils/mediaParser';
import { useMediaStore } from '../../src/store/useMediaStore';

export default function MediaLayout() {
    const { posts, archivedPosts, storyMonths, isScanning } = useMediaStore();

    useFocusEffect(
        useCallback(() => {
            const scan = async () => {
                const storedPath = await AsyncStorage.getItem('instainsight_media_path');
                const baseUri = storedPath || (FileSystem.documentDirectory || '');
                const state = useMediaStore.getState();

                const hasData = state.posts.length > 0 || state.archivedPosts.length > 0 || state.storyMonths.length > 0;
                const pathChanged = state.basePath !== baseUri;

                if ((!hasData && !state.isScanning) || pathChanged) {
                    processInstagramData(baseUri);
                }
            };
            scan();
        }, [])
    );

    return (
        <Tabs
            screenOptions={{
                headerStyle: { backgroundColor: '#000' },
                headerTintColor: '#fff',
                tabBarStyle: { backgroundColor: '#111', borderTopWidth: 0 },
                tabBarActiveTintColor: '#00ffcc',
                tabBarInactiveTintColor: '#888',
                headerShown: false,
            }}
        >
            <Tabs.Screen
                name="posts"
                options={{
                    title: 'Posts',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="images" size={size} color={color} />
                    ),
                }}
            />
            <Tabs.Screen
                name="stories"
                options={{
                    title: 'Stories',
                    tabBarIcon: ({ color, size }) => (
                        <Ionicons name="albums" size={size} color={color} />
                    ),
                }}
            />
        </Tabs>
    );
}
