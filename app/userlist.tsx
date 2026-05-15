import React, { useEffect, useState, useMemo } from 'react';
import {
    View,
    Text,
    StyleSheet,
    FlatList,
    TouchableOpacity,
    TextInput,
    Linking,
    Alert,
    ActivityIndicator,
    Platform,
} from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';

interface InstagramData {
    followers: string[];
    following: string[];
    blocked: string[];
    restricted: string[];
    recentlyUnfollowed: string[];
    recentRequests: string[];
    removedSuggestions: string[];
    hashtags: string[];
    pendingRequests: string[];
    processedAt: number;
}

type ListType =
    | 'notfollowingback'
    | 'youdontfollowback'
    | 'mutuals'
    | 'pending'
    | 'followers'
    | 'following'
    | 'blocked'
    | 'restricted'
    | 'recentlyunfollowed'
    | 'recentrequests'
    | 'removedsuggestions'
    | 'hashtags';

const TYPE_LABELS: Record<string, string> = {
    notfollowingback: 'Not Following Back',
    youdontfollowback: "You Don't Follow Back",
    mutuals: 'Mutual Followers',
    pending: 'Pending Requests',
    followers: 'All Followers',
    following: 'All Following',
    blocked: 'Blocked Profiles',
    restricted: 'Restricted Profiles',
    recentlyunfollowed: 'Recently Unfollowed',
    recentrequests: 'Recent Follow Requests',
    removedsuggestions: 'Removed Suggestions',
    hashtags: 'Following Hashtags',
};

const TYPE_COLORS: Record<string, string> = {
    notfollowingback: '#FF5252',
    youdontfollowback: '#FFC107',
    mutuals: '#00BCD4',
    pending: '#FFC107',
    followers: '#E040FB',
    following: '#7C4DFF',
    blocked: '#FF5252',
    restricted: '#E040FB',
    recentlyunfollowed: '#7C4DFF',
    recentrequests: '#FFC107',
    removedsuggestions: '#9E9E9E',
    hashtags: '#E91E63',
};

const TYPE_ICONS: Record<string, string> = {
    notfollowingback: 'person-remove',
    youdontfollowback: 'eye-off',
    mutuals: 'people-circle',
    pending: 'time',
    followers: 'people',
    following: 'person-add',
    blocked: 'stop-circle-outline',
    restricted: 'lock-closed-outline',
    recentlyunfollowed: 'person-remove-outline',
    recentrequests: 'time-outline',
    removedsuggestions: 'trash-outline',
    hashtags: 'pound',
};

function openProfile(username: string) {
    const instagramUrl = `instagram://user?username=${username}`;
    const webUrl = `https://www.instagram.com/${username}/`;

    if (Platform.OS === 'web') {
        window.open(webUrl, '_blank');
        return;
    }

    Linking.canOpenURL(instagramUrl)
        .then((yes) => {
            if (yes) return Linking.openURL(instagramUrl);
            return Linking.openURL(webUrl);
        })
        .catch(() => Linking.openURL(webUrl));
}

function openHashtag(tag: string) {
    const webUrl = `https://www.instagram.com/explore/tags/${tag}/`;
    if (Platform.OS === 'web') {
        window.open(webUrl, '_blank');
        return;
    }
    Linking.openURL(webUrl);
}

function UserRow({ username, listType }: { username: string; listType: string }) {
    const isHashtag = listType === 'hashtags';
    const color = TYPE_COLORS[listType] || '#E040FB';
    const display = isHashtag ? `#${username}` : `@${username}`;
    const initials = isHashtag ? username.slice(0, 2).toUpperCase() : username.slice(0, 2).toUpperCase();

    const action = useMemo(() => {
        if (isHashtag) {
            return { label: 'Explore', icon: 'search-outline', color: '#E91E63' };
        }
        switch (listType) {
            case 'notfollowingback':
                return { label: 'Unfollow', icon: 'person-remove-outline', color: '#FF5252' };
            case 'youdontfollowback':
            case 'dontfollowback':
                return { label: 'Follow', icon: 'person-add-outline', color: '#00E676' };
            case 'pending':
                return { label: 'Cancel', icon: 'close-circle-outline', color: '#FFC107' };
            default:
                return { label: 'Profile', icon: 'logo-instagram', color: '#E040FB' };
        }
    }, [listType, isHashtag]);

    const handlePress = () => {
        if (isHashtag) {
            openHashtag(username);
        } else {
            openProfile(username);
        }
    };

    return (
        <View style={styles.userRow}>
            <TouchableOpacity
                style={styles.userMain}
                onPress={handlePress}
                activeOpacity={0.7}
            >
                <View style={[styles.avatar, { backgroundColor: color + '22', borderColor: color + '44' }]}>
                    <Text style={[styles.avatarText, { color }]}>{initials}</Text>
                </View>
                <Text style={styles.username} numberOfLines={1}>
                    {display}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.actionBtn, { borderColor: action.color + '44' }]}
                onPress={handlePress}
                activeOpacity={0.8}
            >
                <Ionicons name={action.icon as any} size={15} color={action.color} />
                <Text style={[styles.actionBtnText, { color: action.color }]}>
                    {action.label}
                </Text>
            </TouchableOpacity>
        </View>
    );
}

export default function UserListScreen() {
    const params = useLocalSearchParams<{ type: string }>();
    const type: string = (params.type as string) || 'notfollowingback';
    const navigation = useNavigation();

    const [data, setData] = useState<InstagramData | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [sortAsc, setSortAsc] = useState(true);

    const color = TYPE_COLORS[type] || '#E040FB';
    const label = TYPE_LABELS[type] || type;
    const icon = TYPE_ICONS[type] || 'people';

    useEffect(() => {
        navigation.setOptions({ title: label });
        loadData();
    }, [type]);

    const loadData = async () => {
        try {
            const stored = await AsyncStorage.getItem('instainsight_data');
            if (stored) {
                const parsed = JSON.parse(stored);
                setData({
                    followers: Array.isArray(parsed.followers) ? parsed.followers : [],
                    following: Array.isArray(parsed.following) ? parsed.following : [],
                    blocked: Array.isArray(parsed.blocked) ? parsed.blocked : [],
                    restricted: Array.isArray(parsed.restricted) ? parsed.restricted : [],
                    recentlyUnfollowed: Array.isArray(parsed.recentlyUnfollowed) ? parsed.recentlyUnfollowed : [],
                    recentRequests: Array.isArray(parsed.recentRequests) ? parsed.recentRequests : [],
                    removedSuggestions: Array.isArray(parsed.removedSuggestions) ? parsed.removedSuggestions : [],
                    hashtags: Array.isArray(parsed.hashtags) ? parsed.hashtags : [],
                    pendingRequests: Array.isArray(parsed.pendingRequests) ? parsed.pendingRequests : [],
                    processedAt: parsed.processedAt || Date.now(),
                });
            }
        } catch (e) {
            console.error('Failed to load data:', e);
        }
        setLoading(false);
    };

    const userList = useMemo((): string[] => {
        if (!data) return [];
        const followerSet = new Set(data.followers);
        const followingSet = new Set(data.following);

        switch (type) {
            case 'notfollowingback':
                return data.following.filter((u) => !followerSet.has(u));
            case 'youdontfollowback':
            case 'dontfollowback':
                return data.followers.filter((u) => !followingSet.has(u));
            case 'mutuals':
                return data.following.filter((u) => followerSet.has(u));
            case 'pending':
                return data.pendingRequests;
            case 'followers':
                return data.followers;
            case 'following':
                return data.following;
            case 'blocked':
                return data.blocked;
            case 'restricted':
                return data.restricted;
            case 'recentlyunfollowed':
                return data.recentlyUnfollowed;
            case 'recentrequests':
            case 'recentfollowrequests':
                return data.recentRequests;
            case 'removedsuggestions':
                return data.removedSuggestions;
            case 'hashtags':
                return data.hashtags;
            case 'closefriends':
                return [];
            default:
                return [];
        }
    }, [data, type]);

    const sorted = useMemo(() => {
        const list = [...userList];
        if (sortAsc) {
            list.sort((a, b) => a.localeCompare(b));
        } else {
            list.sort((a, b) => b.localeCompare(a));
        }
        return list;
    }, [userList, sortAsc]);

    const filtered = useMemo(
        () =>
            search
                ? sorted.filter((u) => u.toLowerCase().includes(search.toLowerCase()))
                : sorted,
        [sorted, search]
    );

    const copyUsernames = async () => {
        if (!filtered.length) return;
        const text = filtered.join('\n');
        try {
            await Clipboard.setStringAsync(text);
            Alert.alert('Copied', `${filtered.length} usernames copied to clipboard.`);
        } catch {
            Alert.alert('Error', 'Could not copy to clipboard.');
        }
    };

    const itemLabel = type === 'hashtags' ? 'hashtags' : 'users';

    if (loading) {
        return (
            <View style={[styles.container, styles.center]}>
                <ActivityIndicator size="large" color="#E040FB" />
            </View>
        );
    }

    return (
        <View style={styles.container}>
            {/* Header bar */}
            <View style={[styles.headerBar, { borderBottomColor: color + '44' }]}>
                <View style={styles.headerLeft}>
                    <Ionicons name={icon as any} size={20} color={color} />
                    <Text style={[styles.headerCount, { color }]}>
                        {filtered.length} {itemLabel}
                    </Text>
                </View>
                <View style={styles.headerActions}>
                    <TouchableOpacity
                        style={[styles.headerBtn, { borderColor: color + '44' }]}
                        onPress={copyUsernames}
                        disabled={!filtered.length}
                    >
                        <Ionicons name="copy-outline" size={16} color={color} />
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[styles.headerBtn, { borderColor: color + '44' }]}
                        onPress={() => setSortAsc(!sortAsc)}
                    >
                        <Ionicons
                            name={sortAsc ? 'arrow-up' : 'arrow-down'}
                            size={16}
                            color={color}
                        />
                    </TouchableOpacity>
                </View>
            </View>

            {/* Search */}
            <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#666" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder={`Search ${itemLabel}...`}
                    placeholderTextColor="#555"
                    value={search}
                    onChangeText={setSearch}
                />
                {search ? (
                    <TouchableOpacity onPress={() => setSearch('')}>
                        <Ionicons name="close-circle" size={18} color="#666" />
                    </TouchableOpacity>
                ) : null}
            </View>

            {/* List */}
            {filtered.length === 0 ? (
                <View style={styles.center}>
                    <Ionicons name="checkmark-circle" size={54} color="#00E676" />
                    <Text style={styles.emptyTitle}>
                        {search ? 'No results found' : 'Nothing here!'}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                        {search
                            ? `No ${itemLabel.slice(0, -1)} matching "${search}"`
                            : 'All good in this category.'}
                    </Text>
                </View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={(item, i) => `${item}-${i}`}
                    renderItem={({ item }) => <UserRow username={item} listType={type} />}
                    contentContainerStyle={styles.list}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={30}
                    maxToRenderPerBatch={50}
                    windowSize={10}
                    ItemSeparatorComponent={() => <View style={styles.separator} />}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F1A' },
    center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    headerBar: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingVertical: 14,
        borderBottomWidth: 1,
        backgroundColor: '#13131F',
    },
    headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    headerCount: { fontSize: 15, fontWeight: '700' },
    headerActions: { flexDirection: 'row', gap: 8 },
    headerBtn: {
        paddingHorizontal: 10,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        backgroundColor: '#1A1A2E',
    },
    searchWrap: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#1A1A2E',
        margin: 16,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#2A2A40',
        paddingHorizontal: 14,
        paddingVertical: 10,
        gap: 10,
    },
    searchIcon: {},
    searchInput: { flex: 1, color: '#fff', fontSize: 14 },
    list: { paddingHorizontal: 16, paddingBottom: 40 },
    userRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingVertical: 12,
        gap: 12,
    },
    userMain: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
        gap: 12,
    },
    avatar: {
        width: 42,
        height: 42,
        borderRadius: 21,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    avatarText: { fontSize: 13, fontWeight: '700' },
    username: { flex: 1, color: '#DDD', fontSize: 14, fontWeight: '600' },
    actionBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: 10,
        borderWidth: 1,
        backgroundColor: '#1A1A2E',
        minWidth: 90,
        justifyContent: 'center',
    },
    actionBtnText: { fontSize: 12, fontWeight: '700' },
    separator: { height: 1, backgroundColor: '#1E1E30' },
    emptyTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginTop: 14 },
    emptySubtitle: { fontSize: 13, color: '#666', marginTop: 6 },
});
