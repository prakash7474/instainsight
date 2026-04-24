import { Tabs } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import React, { useEffect } from 'react';
import * as FileSystem from 'expo-file-system';
import { processInstagramData } from '../../src/utils/mediaParser';
import { useMediaStore } from '../../src/store/useMediaStore';

export default function MediaLayout() {
    const { posts, archivedPosts, storyMonths, isScanning } = useMediaStore();

    useEffect(() => {
        // Start scanning on mount if not already scanned
        if (posts.length === 0 && archivedPosts.length === 0 && storyMonths.length === 0 && !isScanning) {
            // Assuming data is in documentDirectory + 'instagram_data/' or similar.
            // If it's stored directly in documentDirectory:
            processInstagramData(FileSystem.documentDirectory || '');
        }
    }, []);

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
