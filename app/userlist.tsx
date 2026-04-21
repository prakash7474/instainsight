import React, { useEffect, useState, useCallback, useMemo } from 'react';
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
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

interface InstagramData {
    followers: string[];
    following: string[];
    processedAt: number;
}

type ListType =
    | 'notfollowingback'
    | 'dontfollowback'
    | 'mutuals'
    | 'followers'
    | 'following';

const TYPE_LABELS: Record<ListType, string> = {
    notfollowingback: 'Not Following Back',
    dontfollowback: "You Don't Follow Back",
    mutuals: 'Mutual Followers',
    followers: 'All Followers',
    following: 'All Following',
};

const TYPE_COLORS: Record<ListType, string> = {
    notfollowingback: '#FF5252',
    dontfollowback: '#FFC107',
    mutuals: '#00BCD4',
    followers: '#E040FB',
    following: '#7C4DFF',
};

const TYPE_ICONS: Record<ListType, string> = {
    notfollowingback: 'person-remove',
    dontfollowback: 'eye-off',
    mutuals: 'people-circle',
    followers: 'people',
    following: 'person-add',
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

function UserRow({ username, listType }: { username: string; listType: ListType }) {
    const color = TYPE_COLORS[listType] || '#E040FB';
    const initials = username.slice(0, 2).toUpperCase();

    const getActionInfo = () => {
        switch (listType) {
            case 'notfollowingback':
                return { label: 'Unfollow', icon: 'person-remove-outline', color: '#FF5252' };
            case 'dontfollowback':
                return { label: 'Follow', icon: 'person-add-outline', color: '#00E676' };
            default:
                return { label: 'Profile', icon: 'logo-instagram', color: '#E040FB' };
        }
    };

    const action = getActionInfo();

    return (
        <View style={styles.userRow}>
            <TouchableOpacity
                style={styles.userMain}
                onPress={() => openProfile(username)}
                activeOpacity={0.7}
            >
                <View style={[styles.avatar, { backgroundColor: color + '22', borderColor: color + '44' }]}>
                    <Text style={[styles.avatarText, { color }]}>{initials}</Text>
                </View>
                <Text style={styles.username} numberOfLines={1}>
                    @{username}
                </Text>
            </TouchableOpacity>

            <TouchableOpacity
                style={[styles.actionBtn, { borderColor: action.color + '44' }]}
                onPress={() => openProfile(username)}
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
    const params = useLocalSearchParams<{ type: ListType }>();
    const type: ListType = (params.type as ListType) || 'notfollowingback';
    const navigation = useNavigation();

    const [data, setData] = useState<InstagramData | null>(null);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [exporting, setExporting] = useState(false);

    const color = TYPE_COLORS[type];
    const label = TYPE_LABELS[type];
    const icon = TYPE_ICONS[type];

    useEffect(() => {
        navigation.setOptions({ title: label });
        loadData();
    }, [type]);

    const loadData = async () => {
        const stored = await AsyncStorage.getItem('instainsight_data');
        if (stored) setData(JSON.parse(stored));
        setLoading(false);
    };

    const userList = useMemo((): string[] => {
        if (!data) return [];
        const followerSet = new Set(data.followers);
        const followingSet = new Set(data.following);

        switch (type) {
            case 'notfollowingback':
                return data.following.filter((u) => !followerSet.has(u));
            case 'dontfollowback':
                return data.followers.filter((u) => !followingSet.has(u));
            case 'mutuals':
                return data.following.filter((u) => followerSet.has(u));
            case 'followers':
                return data.followers;
            case 'following':
                return data.following;
            default:
                return [];
        }
    }, [data, type]);

    const filtered = useMemo(
        () =>
            search
                ? userList.filter((u) => u.toLowerCase().includes(search.toLowerCase()))
                : userList,
        [userList, search]
    );

    const exportCSV = async () => {
        if (!filtered.length) return;
        setExporting(true);
        try {
            const header = 'username,relationship\n';
            const rows = filtered.map((u) => `${u},${label}`).join('\n');
            const csv = header + rows;
            const path = FileSystem.cacheDirectory + `instainsight_${type}_${Date.now()}.csv`;
            await FileSystem.writeAsStringAsync(path, csv, {
                encoding: FileSystem.EncodingType.UTF8,
            });
            const canShare = await Sharing.isAvailableAsync();
            if (canShare) {
                await Sharing.shareAsync(path, { mimeType: 'text/csv', dialogTitle: `Export ${label}` });
            } else {
                Alert.alert('Saved', `CSV saved to: ${path}`);
            }
        } catch (e) {
            Alert.alert('Error', 'Could not export file.');
        }
        setExporting(false);
    };

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
                        {filtered.length} users
                    </Text>
                </View>
                <TouchableOpacity
                    style={[styles.exportBtn, { borderColor: color + '66' }]}
                    onPress={exportCSV}
                    disabled={exporting || !filtered.length}
                >
                    {exporting ? (
                        <ActivityIndicator size="small" color={color} />
                    ) : (
                        <>
                            <Ionicons name="download-outline" size={16} color={color} />
                            <Text style={[styles.exportBtnText, { color }]}>Export CSV</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View style={styles.searchWrap}>
                <Ionicons name="search" size={18} color="#666" style={styles.searchIcon} />
                <TextInput
                    style={styles.searchInput}
                    placeholder="Search username…"
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
                        {search ? 'No results found' : 'Nothing here! 🎉'}
                    </Text>
                    <Text style={styles.emptySubtitle}>
                        {search
                            ? `No user matching "${search}"`
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
    exportBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        paddingHorizontal: 14,
        paddingVertical: 7,
        borderRadius: 10,
        borderWidth: 1,
        backgroundColor: '#1A1A2E',
    },
    exportBtnText: { fontSize: 13, fontWeight: '600' },
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
