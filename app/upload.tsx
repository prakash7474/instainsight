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
import { extractDnaFromZip } from '@/utils/dnaParser';
import {
  parseLikedPosts,
  parseLikedComments,
  parseComments,
  parseLoginActivity,
  parsePolls,
  parseQuestions,
  buildTimeline,
} from '@/utils/instagramHtmlParsers';
import {
  extractZipToTemp,
  readExtractedFile,
  cleanupExtractedDir,
  isNativeStreamingAvailable,
} from '@/utils/streamingZipExtractor';



type ProcessStage = 'idle' | 'reading' | 'extracting' | 'parsing' | 'done' | 'error';

export default function UploadScreen() {
    const router = useRouter();
    const [stage, setStage] = useState<ProcessStage>('idle');
    const [fileName, setFileName] = useState('');
    const [progress, setProgress] = useState(0);
    const [errorMsg, setErrorMsg] = useState('');
    const progressAnim = useRef(new Animated.Value(0)).current;
    const extractDirRef = useRef<string | null>(null);
    const zipRef = useRef<JSZip | null>(null);

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

            setStage('extracting');

            let zip: JSZip | null = null;
            let zipBase64: string | null = null;

            // On native, try streaming extraction first (handles 2GB+ ZIPs)
            if (Platform.OS !== 'web') {
                const sizeHint = asset.size ? `(${(asset.size / 1024 / 1024 / 1024).toFixed(1)}GB)` : '';
                console.log(`[Upload] Extracting ZIP ${sizeHint} via native streaming…`);
                const extractedDir = await extractZipToTemp(asset.uri, undefined, (pct) => {
                    animateProgress(15 + Math.round(pct * 0.35));
                });
                if (extractedDir) {
                    console.log(`[Upload] Extracted to ${extractedDir}`);
                    extractDirRef.current = extractedDir;
                    animateProgress(50);
                } else {
                    console.warn('[Upload] Native extraction failed, falling back to JSZip');
                }
            }

            // If native extraction didn't work (or on web), use JSZip
            if (!extractDirRef.current) {
                // On web, check size to avoid crash
                if (Platform.OS === 'web' && asset.size && asset.size > 500 * 1024 * 1024) {
                    throw new Error(
                        `ZIP file is too large (${(asset.size / 1024 / 1024 / 1024).toFixed(1)}GB) for browser. ` +
                        `Please use the mobile app or request a smaller export from Instagram.`
                    );
                }

                let b64 = '';
                if (Platform.OS === 'web') {
                    const response = await fetch(asset.uri);
                    const blob = await response.blob();
                    b64 = await new Promise((resolve) => {
                        const reader = new FileReader();
                        reader.onloadend = () => {
                            const res = reader.result as string;
                            resolve(res.split(',')[1]);
                        };
                        reader.readAsDataURL(blob);
                    });
                } else {
                    b64 = await FileSystem.readAsStringAsync(asset.uri, {
                        encoding: FileSystem.EncodingType.Base64,
                    });
                }
                zipBase64 = b64;
                zip = new JSZip();
                await zip.loadAsync(b64, { base64: true });
                zipRef.current = zip;
                setActiveZip(zip, zipBase64);
                animateProgress(50);
            }

            setStage('parsing');

            // Parse followers and following from Instagram export
            const followers = await extractUserList([
                'connections/followers_and_following/followers_1.json',
                'connections/followers_and_following/followers.json',
                'followers.json',
                'followers_1.json',
                'connections/followers_and_following/followers_1.html',
                'followers_1.html',
            ]);
            animateProgress(70);

            const following = await extractUserList([
                'connections/followers_and_following/following.json',
                'following.json',
                'connections/followers_and_following/following.html',
                'following.html',
            ]);
            animateProgress(80);

            // 🚀 NEW: Engagement Data (Likes & Comments)
            const engagement = await extractEngagementData(readFile);
            animateProgress(85);

            // 🚀 NEW: Polls Data
            let pollsData = { total: 0, monthly: {} as Record<string, number> };
            const pollsContent = await readFile(['polls/polls.html', 'polls.html', 'content/polls/polls.html']);
            if (pollsContent) {
                pollsData = parsePolls(pollsContent);
            }
            animateProgress(88);

            // 🚀 NEW: Questions Data
            let questionsData = { total: 0, monthly: {} as Record<string, number> };
            const questionsContent = await readFile(['questions/questions.html', 'questions.html', 'content/questions/questions.html']);
            if (questionsContent) {
                questionsData = parseQuestions(questionsContent);
            }
            animateProgress(90);

            // 🚀 NEW: Activity Data (Account History)
            const activity = await extractActivityData(readFile);
            animateProgress(92);

            // Build combined timeline from all activity sources
            const timeline = buildTimeline({
                postComments: engagement.postComments,
                reelComments: engagement.reelComments,
                polls: pollsData,
                questions: questionsData,
                logins: { monthly: activity.monthly },
            });

            // 🚀 NEW: Pending Requests
            const pendingRequests = await extractUserList([
                'connections/followers_and_following/pending_follow_requests.html',
                'pending_follow_requests.json',
            ]);
            animateProgress(94);

            // 🚀 NEW: Parse all insight data files from connections/followers_and_following/
            let insights: Awaited<ReturnType<typeof parseInstagramZip>> = {} as any;
            if (zipRef.current) {
                insights = await parseInstagramZip(zipRef.current);
            }
            animateProgress(96);

            if (!followers.length && !following.length) {
                const files = zipRef.current ? Object.keys(zipRef.current.files).slice(0, 20) : ['(extracted directory)'];
                throw new Error(
                    `Could not find follower/following data in ZIP.\n\nFiles found:\n${files.join('\n')}\n\nNote: If you exported as HTML, we try to parse that, but JSON is recommended.`
                );
            }

            // 🚀 NEW: Media Intelligence (Gallery & Stories)
            let media = { posts: {}, stories: {}, processedAt: Date.now() };
            let storiesData: any[] = [];
            if (zipRef.current) {
                media = await extractMediaFromZip(zipRef.current);
                storiesData = extractStories(zipRef.current);
            }

            // 🧬 DNA Data: parallel extraction of stories, posts, searches, messages, etc.
            let dnaData = null;
            if (zipRef.current) {
                try {
                    animateProgress(95);
                    setStage('parsing');
                    dnaData = await extractDnaFromZip(zipRef.current, (stage, pct) => {
                        setProgress(pct);
                    });
                } catch (e) {
                    console.warn('[InstaInsight][Upload] DNA extraction failed (non-critical):', e);
                }
            }

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
                polls: pollsData,
                questions: questionsData,
                timeline,
                processedAt: Date.now(),
            };

            await AsyncStorage.setItem('instainsight_data', JSON.stringify(data));
            await AsyncStorage.setItem('instainsight_media', JSON.stringify(media));
            if (dnaData) {
                await AsyncStorage.setItem('instainsight_dna', JSON.stringify(dnaData));
            }

            // Save stories metadata (paths, types, months) - no URIs
            await AsyncStorage.setItem(
                'instainsight_stories',
                JSON.stringify({ stories: storiesData, processedAt: Date.now() })
            );

            // Persist ZIP base64 as fallback for app restart (only if JSZip was used)
            if (zipBase64) {
                try {
                    await AsyncStorage.setItem(
                        'instainsight_zip_base64',
                        JSON.stringify({ base64: zipBase64, processedAt: Date.now() })
                    );
                } catch (e) {
                    console.warn('[InstaInsight][Upload] Could not persist ZIP base64 (quota likely exceeded). Stories will work during this session only.', e);
                }
            }

            animateProgress(100);


            setStage('done');
            // Cleanup extracted directory
            if (extractDirRef.current) {
                cleanupExtractedDir(extractDirRef.current).catch(() => {});
                extractDirRef.current = null;
            }

            setTimeout(() => router.push('/dashboard'), 1200);
        } catch (err: any) {
            setStage('error');
            // Cleanup on error
            if (extractDirRef.current) {
                cleanupExtractedDir(extractDirRef.current).catch(() => {});
                extractDirRef.current = null;
            }
            setErrorMsg(err?.message || 'An error occurred while processing the file. Check if it is a valid Instagram export.');
            console.error(err);
        }
    };

    const extractUserList = async (paths: string[]): Promise<string[]> => {
        const content = await readFile(paths);
        if (!content) return [];
        const usedPath = paths.find(p => {
            if (extractDirRef.current) return true; // always true for extracted dir
            const z = zipRef.current;
            if (!z) return false;
            return !!z.file(p) || Object.keys(z.files).some(f => f.endsWith(p.split('/').pop()!));
        }) || paths[0];
        if (usedPath.endsWith('.html') || usedPath.endsWith('.htm')) {
            return parseInstagramUserHTML(content);
        }
        return parseInstagramUserJSON(content);
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

    type ParsedEngagement = {
      likedPosts: { total: number; topUsers: { user: string; count: number }[]; monthly: Record<string, number> };
      likedComments: { total: number; topUsers: { user: string; count: number }[] };
      postComments: { total: number; topTargets: { user: string; count: number }[]; monthly: Record<string, number> };
      reelComments: { total: number; topTargets: { user: string; count: number }[]; monthly: Record<string, number> };
      combined: { user: string; likedPosts: number; likedComments: number; commented: number; total: number }[];
    };

    const extractEngagementData = async (
        readFileFn: (paths: string[], maxSize?: number) => Promise<string | null>,
    ): Promise<ParsedEngagement> => {
        const likesMap: Record<string, number> = {};
        const commentsMap: Record<string, number> = {};
        let likedPostsMonthly: Record<string, number> = {};
        let postCommentsMonthly: Record<string, number> = {};
        let reelCommentsMonthly: Record<string, number> = {};
        let likedPostsTotal = 0;
        let postCommentsTop: { user: string; count: number }[] = [];
        let reelCommentsTop: { user: string; count: number }[] = [];

        try {
            // ── Parse Likes ──
            // Try JSON first
            const likesJsonPaths = ['likes/liked_posts.json', 'likes.json'];
            const likesJson = await readFileFn( likesJsonPaths);
            if (likesJson) {
                const likesData = JSON.parse(likesJson);
                const list = Array.isArray(likesData) ? likesData : (likesData.likes_media_likes || []);
                list.forEach((item: any) => {
                    const username = item?.string_list_data?.[0]?.value || item?.title;
                    if (username && typeof username === 'string') {
                        likesMap[username] = (likesMap[username] || 0) + 1;
                    }
                });
            }

            // Try new HTML parser (liked_posts.html — _a6-g format)
            const likesHtmlPaths = [
                'likes/liked_posts.html',
                'likes.html',
                'content/likes/liked_posts.html',
            ];
            const likesHtml = await readFileFn( likesHtmlPaths);
            if (likesHtml && Object.keys(likesMap).length === 0) {
                const parsed = parseLikedPosts(likesHtml);
                parsed.topUsers.forEach(({ user, count }) => { likesMap[user] = count; });
                likedPostsMonthly = parsed.monthly;
                likedPostsTotal = parsed.total;
            } else if (likesHtml) {
                // Augment with monthly data from parser
                const parsed = parseLikedPosts(likesHtml);
                likedPostsMonthly = parsed.monthly;
                likedPostsTotal = Object.values(likesMap).reduce((a, b) => a + b, 0);
            }

            // Fallback generic HTML parser
            if (Object.keys(likesMap).length === 0 && likesHtml) {
                const htmlCounts = extractUsernamesWithCounts(likesHtml);
                Object.assign(likesMap, htmlCounts);
            }

            likedPostsTotal = Object.values(likesMap).reduce((a, b) => a + b, 0);

            // ── Parse Comments (liked comments) ──
            const cmtLikedPaths = [
                'likes/liked_comments.json',
                'likes/comments.json',
                'liked_comments.json',
                'likes/liked_comments.html',
                'liked_comments.html',
                'content/likes/liked_comments.html',
            ];
            const cmtLikedContent = await readFileFn( cmtLikedPaths);
            if (cmtLikedContent) {
                const isHtml = cmtLikedContent.trim().charAt(0) === '<';
                if (isHtml) {
                    // Try new parser first
                    const parsed = parseLikedComments(cmtLikedContent);
                    if (parsed.total > 0) {
                        parsed.topUsers.forEach(({ user, count }) => { commentsMap[user] = count; });
                    } else {
                        const htmlCounts = extractUsernamesWithCounts(cmtLikedContent);
                        Object.assign(commentsMap, htmlCounts);
                    }
                } else {
                    const data = JSON.parse(cmtLikedContent);
                    const list = Array.isArray(data) ? data : (data.likes_comment_likes || []);
                    list.forEach((item: any) => {
                        const username = item?.string_list_data?.[0]?.value || item?.title;
                        if (username && typeof username === 'string') {
                            commentsMap[username] = (commentsMap[username] || 0) + 1;
                        }
                    });
                }
            }

            // ── Parse Post Comments (media comments you wrote) ──
            const postCmtPaths = [
                'comments/post_comments_1.json',
                'comments/post_comments.json',
                'post_comments_1.json',
                'post_comments.json',
                'comments/post_comments_1.html',
                'post_comments_1.html',
                'comments/post_comments.html',
                'post_comments.html',
                'comments.html',
                'content/comments/post_comments_1.html',
            ];
            const postCmtContent = await readFileFn( postCmtPaths);
            if (postCmtContent) {
                const isHtml = postCmtContent.trim().charAt(0) === '<';
                if (isHtml) {
                    const parsed = parseComments(postCmtContent);
                    postCommentsTop = parsed.topTargets;
                    postCommentsMonthly = parsed.monthly;
                } else {
                    const data = JSON.parse(postCmtContent);
                    const list = Array.isArray(data) ? data : (data.comments_media_comments || []);
                    list.forEach((item: any) => {
                        const username = item?.string_list_data?.[0]?.value || item?.title;
                        if (username && typeof username === 'string') {
                            likesMap[username] = (likesMap[username] || 0) + 1;
                        }
                    });
                }
            }

            // ── Parse Reel Comments ──
            const reelCmtPaths = [
                'comments/reels_comments.json',
                'reels_comments.json',
                'comments/reels_comments.html',
                'reels_comments.html',
                'content/comments/reels_comments.html',
            ];
            const reelCmtContent = await readFileFn( reelCmtPaths);
            if (reelCmtContent) {
                const isHtml = reelCmtContent.trim().charAt(0) === '<';
                if (isHtml) {
                    const parsed = parseComments(reelCmtContent);
                    reelCommentsTop = parsed.topTargets;
                    reelCommentsMonthly = parsed.monthly;
                }
            }
        } catch (e) {
            console.log('Engagement parsing failed (non-critical):', e);
        }

        // Merge likes + comments into combined list
        const allUsers = new Set([...Object.keys(likesMap), ...Object.keys(commentsMap)]);
        const combined: { user: string; likedPosts: number; likedComments: number; commented: number; total: number }[] = [];
        for (const user of allUsers) {
            const likedPosts = likesMap[user] || 0;
            const likedComments = commentsMap[user] || 0;
            combined.push({ user, likedPosts, likedComments, commented: 0, total: likedPosts + likedComments });
        }
        combined.sort((a, b) => b.total - a.total);

        const totalLikedComments = Object.values(commentsMap).reduce((a, b) => a + b, 0);

        return {
            likedPosts: {
                total: likedPostsTotal,
                topUsers: Object.entries(likesMap)
                    .map(([user, count]) => ({ user, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 20),
                monthly: likedPostsMonthly,
            },
            likedComments: {
                total: totalLikedComments,
                topUsers: Object.entries(commentsMap)
                    .map(([user, count]) => ({ user, count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 20),
            },
            postComments: {
                total: postCommentsTop.reduce((a, b) => a + b.count, 0),
                topTargets: postCommentsTop,
                monthly: postCommentsMonthly,
            },
            reelComments: {
                total: reelCommentsTop.reduce((a, b) => a + b.count, 0),
                topTargets: reelCommentsTop,
                monthly: reelCommentsMonthly,
            },
            combined: combined.slice(0, 10),
        };
    };

    type LoginEntryRaw = {
        time: string;
        device: string;
        ip: string;
        userAgent: string;
    };

    function parseDevice(userAgent: string): string {
        if (!userAgent) return 'Unknown';
        if (/Android/i.test(userAgent)) return 'Android';
        if (/iPhone|iPad|iOS/i.test(userAgent)) return 'iOS';
        if (/Windows NT/i.test(userAgent)) return 'Windows';
        if (/Macintosh/i.test(userAgent)) return 'Mac';
        return 'Web/Other';
    }

    function parseMonthKey(timeStr: string): string | null {
        const m = timeStr.match(/(\w{3})\s+\d+,\s+(\d{4})/);
        if (!m) return null;
        const months: Record<string, string> = {
            Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
            Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
        };
        return `${m[2]}-${months[m[1]] || '00'}`;
    }

    function extractField(text: string, key: string): string | null {
        const m = text.match(new RegExp(`${key}\\|?\\n?([^|\\n]+)`));
        return m ? m[1].trim() : null;
    }

    const extractActivityData = async (
        readFileFn: (paths: string[], maxSize?: number) => Promise<string | null>,
    ) => {
        const loginEntries: LoginEntryRaw[] = [];
        let loginMonthly: Record<string, number> = {};
        let deviceCounts: Record<string, number> = {};

        try {
            const paths = [
                'account_history/login_history.json',
                'login_history.json',
                'account_history/login_history.html',
                'login_history.html',
                'security_and_login_information/login_and_profile_creation/login_activity.html',
                'content/login_and_profile_creation/login_activity.html',
                'login_activity.html',
            ];
            const content = await readFileFn( paths);
            if (content) {
                const isHtml = content.trim().charAt(0) === '<';
                if (isHtml) {
                    // Try new _a6-g parser first
                    const parsed = parseLoginActivity(content);
                    if (parsed.total > 0) {
                        parsed.logins.forEach(l => {
                            loginEntries.push({
                                time: l.time,
                                device: l.device,
                                ip: '',
                                userAgent: '',
                            });
                        });
                        deviceCounts = parsed.deviceCounts;
                        loginMonthly = parsed.monthly;
                    } else {
                        // Fallback to generic HTML extraction
                        const text = content.replace(/<[^>]+>/g, '\n');
                        const sections = text.split(/\n{2,}/);
                        for (const section of sections) {
                            const joined = section.split('\n').map(s => s.trim()).filter(Boolean).join(' | ');
                            const time = extractField(joined, 'Time');
                            if (time) {
                                const userAgent = extractField(joined, 'User agent') || '';
                                const ip = extractField(joined, 'IP address') || '';
                                loginEntries.push({
                                    time,
                                    device: parseDevice(userAgent),
                                    ip,
                                    userAgent,
                                });
                            }
                        }
                    }
                } else {
                    const data = JSON.parse(content);
                    const list = data?.login_history || data || [];
                    if (Array.isArray(list)) {
                        for (const item of list) {
                            const ts = item?.string_list_data?.[0]?.timestamp || item?.timestamp;
                            if (ts) {
                                const d = new Date(ts * 1000);
                                const time = d.toLocaleString('en-US', {
                                    month: 'short', day: 'numeric', year: 'numeric',
                                    hour: '2-digit', minute: '2-digit',
                                });
                                loginEntries.push({
                                    time,
                                    device: 'Unknown',
                                    ip: '',
                                    userAgent: '',
                                });
                            }
                        }
                    }
                }
            }
        } catch (e) {
            console.log('Activity parsing failed (non-critical):', e);
        }

        if (Object.keys(deviceCounts).length === 0) {
            for (const e of loginEntries) {
                deviceCounts[e.device] = (deviceCounts[e.device] || 0) + 1;
            }
        }

        if (Object.keys(loginMonthly).length === 0) {
            const timelineEntries = loginEntries.map(e => ({
                monthKey: parseMonthKey(e.time),
                device: e.device,
            }));
            const monthly: Record<string, number> = {};
            for (const e of timelineEntries) {
                if (e.monthKey) monthly[e.monthKey] = (monthly[e.monthKey] || 0) + 1;
            }
            loginMonthly = monthly;
        }

        return {
            loginHistory: loginEntries,
            deviceCounts,
            monthly: loginMonthly,
        };
    };

    const MAX_HTML_SIZE = 50 * 1024 * 1024; // 50MB — skip HTML files larger than this

    /** Try to read a file from extracted directory, then fall back to JSZip */
    const readFile = async (paths: string[], maxSize?: number): Promise<string | null> => {
        // Try extracted directory first (native streaming path)
        if (extractDirRef.current) {
            for (const path of paths) {
                const content = await readExtractedFile(extractDirRef.current, path, maxSize ?? MAX_HTML_SIZE);
                if (content !== null) return content;
            }
            return null;
        }
        // Fall back to JSZip
        const z = zipRef.current;
        if (!z) return null;
        const limit = maxSize ?? MAX_HTML_SIZE;
        const getSize = (f: JSZip.JSZipObject): number => {
            const ff = f as any;
            return ff.uncompressedSize || ff._data?.uncompressedSize || 0;
        };
        for (const path of paths) {
            const file = z.file(path);
            if (file) {
                const size = getSize(file);
                if (size > limit) {
                    console.warn(`[Upload] Skipping ${path} — ${(size / 1024 / 1024).toFixed(1)}MB exceeds limit`);
                    return null;
                }
                try {
                    return await file.async('string');
                } catch (e) {
                    console.warn(`[Upload] Failed to read ${path}:`, e);
                    return null;
                }
            }
        }
        const all = Object.keys(z.files);
        for (const path of paths) {
            const base = path.split('/').pop()!;
            const match = all.find(f => f.endsWith(base));
            if (match) {
                const file = z.file(match)!;
                const size = getSize(file);
                if (size > limit) {
                    console.warn(`[Upload] Skipping ${match} — ${(size / 1024 / 1024).toFixed(1)}MB exceeds limit`);
                    return null;
                }
                try {
                    return await file.async('string');
                } catch (e) {
                    console.warn(`[Upload] Failed to read ${match}:`, e);
                    return null;
                }
            }
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
