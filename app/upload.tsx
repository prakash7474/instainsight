import React, { useState, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    Animated,
    ActivityIndicator,
    Alert,
    ScrollView,
    Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import JSZip from 'jszip';
import { extractMediaFromZip } from '@/utils/parseMediaFromZip';
import { extractStories, setActiveZip } from '@/utils/stories';
import { buildAnalytics, parsePendingFollowRequestsHtml, uniqueUsers, type User } from '@/utils/instagramAnalyticsUtils';
import { parseInstagramZip } from '@/utils/instagramZipParser';



type ProcessStage = 'idle' | 'reading' | 'extracting' | 'parsing' | 'done' | 'error';

export default function UploadScreen() {
    const router = useRouter();
    const [stage, setStage] = useState<ProcessStage>('idle');
    const [fileName, setFileName] = useState('');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const progressAnim = useRef(new Animated.Value(0)).current;

    const animateProgress = (to: number) => {
        Animated.timing(progressAnim, {
            toValue: to,
            duration: 500,
            useNativeDriver: false,
        }).start();
        setProgress(to);
    };

    const pickAndProcess = async () => {
        try {
            setStage('reading');
            setErrorMsg('');

            const result = await DocumentPicker.getDocumentAsync({
                type: ['application/zip', 'application/x-zip-compressed', '*/*'],
                copyToCacheDirectory: true,
            });

            if (result.canceled || !result.assets?.length) {
                setStage('idle');
                return;
            }

            const asset = result.assets[0];
            setFileName(asset.name);
            animateProgress(15);

            // Read file as base64
            setStage('extracting');
            let base64 = '';

            if (Platform.OS === 'web') {
                // Web fallback: fetch blob from URI and read as base64
                const response = await fetch(asset.uri);
                const blob = await response.blob();
                base64 = await new Promise((resolve) => {
                    const reader = new FileReader();
                    reader.onloadend = () => {
                        const res = reader.result as string;
                        resolve(res.split(',')[1]); // Remove data: url prefix
                    };
                    reader.readAsDataURL(blob);
                });
            } else {
                base64 = await FileSystem.readAsStringAsync(asset.uri, {
                    encoding: FileSystem.EncodingType.Base64,
                });
            }
            animateProgress(35);

            // Unzip
            const zip = new JSZip();
            await zip.loadAsync(base64, { base64: true });
            animateProgress(55);

            setStage('parsing');
            // Parse followers and following from Instagram export
            const followers = await extractUserList(zip, [
                'connections/followers_and_following/followers_1.json',
                'connections/followers_and_following/followers.json',
                'followers.json',
                'followers_1.json',
                'connections/followers_and_following/followers_1.html',
                'followers_1.html',
            ]);
            animateProgress(70);

            const following = await extractUserList(zip, [
                'connections/followers_and_following/following.json',
                'following.json',
                'connections/followers_and_following/following.html',
                'following.html',
            ]);
            animateProgress(85);

            // 🚀 NEW: Engagement Data (Likes & Comments)
            const engagement = await extractEngagementData(zip);
            animateProgress(90);

            // 🚀 NEW: Activity Data (Account History)
            const activity = await extractActivityData(zip);
            animateProgress(92);

            // 🚀 NEW: Pending Requests
            const pendingRequests = await extractUserList(zip, [
                'connections/followers_and_following/pending_follow_requests.html',
                'pending_follow_requests.json',
            ]);
            animateProgress(94);

            // 🚀 NEW: Parse all insight data files from connections/followers_and_following/
            const insights = await parseInstagramZip(zip);
            animateProgress(97);

            if (!followers.length && !following.length) {
                // Try to list files for debugging
                const files = Object.keys(zip.files).slice(0, 20);
                throw new Error(
                    `Could not find follower/following data in ZIP.\n\nFiles found:\n${files.join('\n')}\n\nNote: If you exported as HTML, we try to parse that, but JSON is recommended.`
                );
            }

            // 🚀 NEW: Media Intelligence (Gallery & Stories)
            const media = await extractMediaFromZip(zip);

            // NEW: Extract stories metadata (paths, types, months) - no URIs
            const storiesData = extractStories(zip);

            // Cache ZIP for Stories screen URI generation
            setActiveZip(zip, base64);

            const data = {
                followers,
                following,
                blocked: insights.blocked,
                restricted: insights.restricted,
                closeFriends: insights.closeFriends,
                recentlyUnfollowed: insights.recentlyUnfollowed,
                recentRequests: insights.recentRequests,
                removedSuggestions: insights.removedSuggestions,
                hashtags: insights.hashtags,
                pendingRequests,
                engagement,
                activity,
                processedAt: Date.now(),
            };

            await AsyncStorage.setItem('instainsight_data', JSON.stringify(data));
            await AsyncStorage.setItem('instainsight_media', JSON.stringify(media));

            // Save stories metadata (paths, types, months) - no URIs
            await AsyncStorage.setItem(
                'instainsight_stories',
                JSON.stringify({ stories: storiesData, processedAt: Date.now() })
            );

            // Persist ZIP base64 as fallback for app restart
            try {
                await AsyncStorage.setItem(
                    'instainsight_zip_base64',
                    JSON.stringify({ base64, processedAt: Date.now() })
                );
            } catch (e) {
                console.warn('[InstaInsight][Upload] Could not persist ZIP base64 (quota likely exceeded). Stories will work during this session only.', e);
            }

            animateProgress(100);


            setStage('done');
            setTimeout(() => router.push('/dashboard'), 1200);
        } catch (err: any) {
            setStage('error');
            setErrorMsg(err?.message || 'An error occurred while processing the file. Check if it is a valid Instagram export.');
            console.error(err);
        }
    };

    const extractUserList = async (zip: JSZip, paths: string[]): Promise<string[]> => {
        for (const path of paths) {
            const file = zip.file(path);
            if (file) {
                const content = await file.async('string');
                if (path.endsWith('.html')) {
                    return parseInstagramUserHTML(content);
                }
                return parseInstagramUserJSON(content);
            }
        }
        // Try fuzzy match
        const allFiles = Object.keys(zip.files);
        for (const path of paths) {
            const base = path.split('/').pop()!;
            const match = allFiles.find((f) => f.endsWith(base));
            if (match) {
                const file = zip.file(match);
                if (file) {
                    const content = await file.async('string');
                    if (match.endsWith('.html')) {
                        return parseInstagramUserHTML(content);
                    }
                    return parseInstagramUserJSON(content);
                }
            }
        }
        return [];
    };

    const FIELD_LABELS = new Set(['Name','URL','Caption','Owner','Username','Hashtags',
      'Instagram','Followers','Following','Date','Type']);

    const extractUsernamesWithCounts = (html: string): Record<string, number> => {
        const counts: Record<string, number> = {};

        // Try 1: anchor tags with instagram.com profile links (older export format)
        const anchorRegex = /<a [^>]*href="https:\/\/www\.instagram\.com\/([^"\/]+)\/?"[^>]*>([^<]+)<\/a>/gi;
        let match;
        while ((match = anchorRegex.exec(html)) !== null) {
            const username = (match[1] || match[2]).trim();
            if (username && username.length > 0 && !FIELD_LABELS.has(username)) {
                counts[username] = (counts[username] || 0) + 1;
            }
        }

        if (Object.keys(counts).length > 0) return counts;

        // Try 2: newer export — find <h2>Owner</h2> sections, extract username after "Username" label
        const ownerSectionRegex = /<h2>Owner<\/h2>([\s\S]*?)(?=<h2>|$)/gi;
        while ((match = ownerSectionRegex.exec(html)) !== null) {
            const section = match[1];
            const userMatch = section.match(/Username\s*([^\s<]+)/);
            if (userMatch) {
                const username = userMatch[1].trim();
                if (username && !FIELD_LABELS.has(username)) {
                    counts[username] = (counts[username] || 0) + 1;
                }
            }
        }

        if (Object.keys(counts).length > 0) return counts;

        // Try 3: fallback — >text< pattern, but exclude field labels
        const simpleRegex = />([a-zA-Z0-9._]{2,30})</g;
        while ((match = simpleRegex.exec(html)) !== null) {
            const val = match[1].trim();
            if (!FIELD_LABELS.has(val)) {
                counts[val] = (counts[val] || 0) + 1;
            }
        }
        return counts;
    };

    const extractEngagementData = async (zip: JSZip) => {
        const likesMap: Record<string, number> = {};
        const commentsMap: Record<string, number> = {};

        try {
            // Parse Likes — try JSON first, fall back to HTML
            const likesPaths = [
                'likes/liked_posts.json',
                'likes.json',
                'likes/liked_posts.html',
                'likes.html',
            ];
            const likesContent = await getZipFileContent(zip, likesPaths);
            if (likesContent) {
                const isHtml = likesContent.trim().charAt(0) === '<';

                if (isHtml) {
                    const htmlCounts = extractUsernamesWithCounts(likesContent);
                    Object.assign(likesMap, htmlCounts);
                } else {
                    const likesData = JSON.parse(likesContent);
                    const list = Array.isArray(likesData)
                        ? likesData
                        : (likesData.likes_media_likes || []);

                    list.forEach((item: any) => {
                        const username =
                            item?.string_list_data?.[0]?.value || item?.title;
                        if (username && typeof username === 'string') {
                            likesMap[username] = (likesMap[username] || 0) + 1;
                        }
                    });
                }
            }

            // Parse Comments — try JSON first, fall back to HTML
            const commsPaths = [
                'comments/comments.json',
                'comments/post_comments.json',
                'post_comments.json',
                'comments/comments.html',
                'comments/post_comments.html',
                'post_comments.html',
                'comments.html',
            ];
            const commsContent = await getZipFileContent(zip, commsPaths);
            if (commsContent) {
                const isHtml = commsContent.trim().charAt(0) === '<';

                if (isHtml) {
                    const htmlCounts = extractUsernamesWithCounts(commsContent);
                    Object.assign(commentsMap, htmlCounts);
                } else {
                    const commsData = JSON.parse(commsContent);
                    const list = Array.isArray(commsData)
                        ? commsData
                        : (commsData.comments_media_comments || []);

                    list.forEach((item: any) => {
                        const username =
                            item?.string_list_data?.[0]?.value || item?.title;
                        if (username && typeof username === 'string') {
                            commentsMap[username] = (commentsMap[username] || 0) + 1;
                        }
                    });
                }
            }
        } catch (e) {
            console.log('Engagement parsing failed (non-critical):', e);
        }

        // Merge likes + comments into combined list
        const allUsers = new Set([...Object.keys(likesMap), ...Object.keys(commentsMap)]);
        const combined: { user: string; likedPosts: number; likedComments: number; total: number }[] = [];
        for (const user of allUsers) {
            const likedPosts = likesMap[user] || 0;
            const likedComments = commentsMap[user] || 0;
            combined.push({ user, likedPosts, likedComments, total: likedPosts + likedComments });
        }
        combined.sort((a, b) => b.total - a.total);

        const totalLikes = Object.values(likesMap).reduce((a, b) => a + b, 0);
        const totalComments = Object.values(commentsMap).reduce((a, b) => a + b, 0);

        return {
            topLikes: Object.entries(likesMap)
                .map(([user, count]) => ({ user, count }))
                .sort((a, b) => b.count - a.count)
                .slice(0, 10),
            topCombined: combined.slice(0, 10),
            totalLikes,
            totalComments,
        };
    };

    const extractActivityData = async (zip: JSZip) => {
        const result = {
            loginHistory: [] as number[], // Timestamps
        };

        try {
            // Try JSON first, fall back to HTML
            const path = [
                'account_history/login_history.json',
                'login_history.json',
                'account_history/login_history.html',
                'login_history.html',
            ];
            const content = await getZipFileContent(zip, path);
            if (content) {
                const isHtml = content.trim().charAt(0) === '<';
                if (isHtml) {
                    // HTML version — not easily parseable into timestamps; skip
                    console.log(
                        'Activity data is HTML format, timestamps not extracted',
                    );
                } else {
                    const data = JSON.parse(content);
                    const list = data?.login_history || data || [];
                    if (Array.isArray(list)) {
                        result.loginHistory = list
                            .map((item: any) => {
                                const ts =
                                    item?.string_list_data?.[0]?.timestamp ||
                                    item?.timestamp;
                                return ts ? ts * 1000 : null;
                            })
                            .filter(Boolean) as number[];
                    }
                }
            }
        } catch (e) {
            console.log('Activity parsing failed (non-critical):', e);
        }
        return result;
    };

    const getZipFileContent = async (zip: JSZip, paths: string[]) => {
        for (const path of paths) {
            const file = zip.file(path);
            if (file) return await file.async('string');
        }
        // Fuzzy local
        const all = Object.keys(zip.files);
        for (const path of paths) {
            const base = path.split('/').pop()!;
            const match = all.find(f => f.endsWith(base));
            if (match) return await zip.file(match)!.async('string');
        }
        return null;
    };

    const parseInstagramUserHTML = (html: string): string[] => {
        const users: string[] = [];
        // Match <a> tags with instagram links or text
        // Instagram HTML format usually has usernames in <a> tags or as plain text in <li>
        const regex = /<a [^>]*href="https:\/\/www\.instagram\.com\/([^"\/]+)\/?"[^>]*>([^<]+)<\/a>/gi;
        let match;
        while ((match = regex.exec(html)) !== null) {
            const username = match[1] || match[2];
            if (username && !users.includes(username)) {
                users.push(username.trim());
            }
        }

        if (users.length === 0) {
            // Fallback for different HTML structures: find any @username pattern if applicable
            // or list-based simple text extraction
            const simpleRegex = />([a-zA-Z0-9._]{2,30})</g;
            while ((match = simpleRegex.exec(html)) !== null) {
                const val = match[1];
                // Filter out common UI labels
                if (!['Instagram', 'Followers', 'Following', 'Date', 'Type'].includes(val)) {
                    users.push(val);
                }
            }
        }
        return [...new Set(users)];
    };

    const parseInstagramUserJSON = (json: string): string[] => {
        try {
            const data = JSON.parse(json);
            const users: string[] = [];

            // Instagram new format: array of {title, media_list_data, string_list_data}
            if (Array.isArray(data)) {
                for (const item of data) {
                    if (item?.string_list_data) {
                        for (const entry of item.string_list_data) {
                            if (entry?.value) users.push(entry.value);
                        }
                    } else if (item?.value) {
                        users.push(item.value);
                    } else if (typeof item === 'string') {
                        users.push(item);
                    }
                }
                return users;
            }

            // Old format: {relationships_followers: [...]}
            const keys = Object.keys(data);
            for (const key of keys) {
                const arr = data[key];
                if (Array.isArray(arr)) {
                    for (const item of arr) {
                        if (item?.string_list_data) {
                            for (const entry of item.string_list_data) {
                                if (entry?.value) users.push(entry.value);
                            }
                        } else if (item?.value) {
                            users.push(item.value);
                        }
                    }
                }
            }
            return users;
        } catch {
            return [];
        }
    };

    const stageLabels: Record<ProcessStage, string> = {
        idle: '',
        reading: 'Reading file…',
        extracting: 'Extracting ZIP…',
        parsing: 'Parsing data…',
        done: '✅ Done! Redirecting…',
        error: 'Error occurred',
    };

    return (
        <View style={styles.container}>
            <LinearGradient
                colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
                style={StyleSheet.absoluteFillObject}
            />
            <ScrollView contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
                {/* Instructions */}
                <View style={styles.card}>
                    <Text style={styles.cardTitle}>📱 How to Export Instagram Data</Text>
                    {[
                        'Open Instagram → Profile → ☰ Menu',
                        'Tap "Your Activity" → "Download your data"',
                        'Select "Download or transfer information"',
                        'Choose HTML format and request download',
                        'choose the all time data range for a complete export',
                        'Download the ZIP from your email and import here',
                    ].map((step, i) => (
                        <View key={i} style={styles.instructionRow}>
                            <View style={styles.instructionBadge}>
                                <Text style={styles.instructionNum}>{i + 1}</Text>
                            </View>
                            <Text style={styles.instructionText}>{step}</Text>
                        </View>
                    ))}
                </View>

                {/* Upload area */}
                <TouchableOpacity
                    style={[
                        styles.uploadArea,
                        stage !== 'idle' && stage !== 'error' && styles.uploadAreaActive,
                    ]}
                    onPress={pickAndProcess}
                    disabled={stage !== 'idle' && stage !== 'error' && stage !== 'done'}
                    activeOpacity={0.8}
                >
                    {stage === 'idle' || stage === 'error' ? (
                        <>
                            <LinearGradient
                                colors={['#E040FB22', '#7C4DFF22']}
                                style={styles.uploadIcon}
                            >
                                <Ionicons name="cloud-upload" size={40} color="#E040FB" />
                            </LinearGradient>
                            <Text style={styles.uploadTitle}>Tap to Import ZIP File</Text>
                            <Text style={styles.uploadSubtitle}>
                                Select your Instagram data export (.zip)
                            </Text>
                        </>
                    ) : stage === 'done' ? (
                        <>
                            <Ionicons name="checkmark-circle" size={56} color="#00E676" />
                            <Text style={styles.doneText}>Data Processed!</Text>
                        </>
                    ) : (
                        <>
                            <ActivityIndicator size="large" color="#E040FB" />
                            <Text style={styles.processingText}>{stageLabels[stage]}</Text>
                            {fileName ? (
                                <Text style={styles.fileName} numberOfLines={1}>
                                    {fileName}
                                </Text>
                            ) : null}
                        </>
                    )}
                </TouchableOpacity>

                {/* Progress bar */}
                {stage !== 'idle' && stage !== 'error' && (
                    <View style={styles.progressWrap}>
                        <Animated.View
                            style={[
                                styles.progressBar,
                                {
                                    width: progressAnim.interpolate({
                                        inputRange: [0, 100],
                                        outputRange: ['0%', '100%'],
                                    }),
                                    backgroundColor: stage === 'done' ? '#00E676' : '#E040FB',
                                },
                            ]}
                        />
                    </View>
                )}

                {/* Error */}
                {stage === 'error' && (
                    <View style={styles.errorCard}>
                        <Ionicons name="alert-circle" size={24} color="#FF5252" />
                        <Text style={styles.errorText}>{errorMsg}</Text>
                    </View>
                )}

                {/* Privacy note */}
                <View style={styles.privacyNote}>
                    <Ionicons name="lock-closed" size={16} color="#00E676" />
                    <Text style={styles.privacyText}>
                        Your file is processed entirely on-device. Nothing is uploaded to any server.
                    </Text>
                </View>
            </ScrollView>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#0F0F1A' },
    scroll: { padding: 20, paddingTop: 28 },
    card: {
        backgroundColor: '#1A1A2E',
        borderRadius: 20,
        padding: 20,
        marginBottom: 20,
        borderWidth: 1,
        borderColor: '#2A2A40',
    },
    cardTitle: { fontSize: 16, fontWeight: '700', color: '#fff', marginBottom: 16 },
    instructionRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 12 },
    instructionBadge: {
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: '#7C4DFF',
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 12,
        marginTop: 1,
    },
    instructionNum: { color: '#fff', fontSize: 12, fontWeight: '700' },
    instructionText: { color: '#CCC', fontSize: 13, flex: 1, lineHeight: 20 },
    uploadArea: {
        backgroundColor: '#1A1A2E',
        borderRadius: 24,
        borderWidth: 2,
        borderColor: '#E040FB44',
        borderStyle: 'dashed',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 40,
        marginBottom: 16,
        minHeight: 200,
    },
    uploadAreaActive: { borderColor: '#E040FB', borderStyle: 'solid' },
    uploadIcon: {
        width: 80,
        height: 80,
        borderRadius: 24,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 16,
    },
    uploadTitle: { fontSize: 18, fontWeight: '700', color: '#fff', marginBottom: 6 },
    uploadSubtitle: { fontSize: 13, color: '#888', textAlign: 'center' },
    processingText: { color: '#E040FB', fontSize: 16, fontWeight: '600', marginTop: 16 },
    doneText: { color: '#00E676', fontSize: 18, fontWeight: '700', marginTop: 12 },
    fileName: { color: '#888', fontSize: 12, marginTop: 8, maxWidth: '80%' },
    progressWrap: {
        height: 6,
        backgroundColor: '#2A2A40',
        borderRadius: 3,
        overflow: 'hidden',
        marginBottom: 20,
    },
    progressBar: { height: '100%', borderRadius: 3 },
    errorCard: {
        backgroundColor: '#FF525211',
        borderRadius: 14,
        borderWidth: 1,
        borderColor: '#FF525233',
        padding: 16,
        flexDirection: 'row',
        gap: 10,
        alignItems: 'flex-start',
        marginBottom: 16,
    },
    errorText: { color: '#FF5252', fontSize: 13, flex: 1, lineHeight: 20 },
    privacyNote: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        backgroundColor: '#00E67611',
        borderRadius: 12,
        padding: 14,
        borderWidth: 1,
        borderColor: '#00E67633',
        marginTop: 4,
    },
    privacyText: { color: '#00E676', fontSize: 12, flex: 1, lineHeight: 18 },
});
