import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  ActivityIndicator,
  Dimensions,
  Platform,
} from 'react-native';
import { useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import * as FileSystem from 'expo-file-system';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import JSZip from 'jszip';
import { WebView } from 'react-native-webview';

const { width } = Dimensions.get('window');

type LoginActivity = {
  timestamp: string;
  ip: string;
  userAgent: string;
  device: string;
};

export default function ZipViewerGuide() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [activities, setActivities] = useState<LoginActivity[]>([]);
  const [zipFiles, setZipFiles] = useState<string[]>([]);
  const [htmlPreview, setHtmlPreview] = useState<string | null>(null);
  const [showCode, setShowCode] = useState(false);
  const [debugInfo, setDebugInfo] = useState('');

  const handleZipUpload = async () => {
    try {
      setLoading(true);
      setActivities([]);
      setZipFiles([]);
      setHtmlPreview(null);
      setDebugInfo('');

      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) {
        setLoading(false);
        return;
      }

      const asset = result.assets[0];
      let b64 = '';
      if (Platform.OS === 'web') {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        b64 = await new Promise<string>((resolve) => {
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

      const zip = new JSZip();
      await zip.loadAsync(b64, { base64: true });

      const allFiles = Object.keys(zip.files);
      setZipFiles(allFiles);
      console.log('[ZipViewer] All ZIP files:', allFiles);

      // Find login files
      const loginFiles = allFiles.filter(
        (f) => f.toLowerCase().includes('login') && f.endsWith('.html')
      );
      console.log('[ZipViewer] Login files:', loginFiles);

      const results: LoginActivity[] = [];
      let latestHtml = '';

      for (const fileName of loginFiles) {
        const content = await zip.files[fileName].async('text');
        latestHtml = content;

        console.log(`[ZipViewer] === ${fileName} ===`);
        console.log(content);

        // Regex check for JSON-like activity data
        const hasActivityData =
          /"timestamp"|ip|user_agent|device/i.test(content);

        if (hasActivityData) {
          // Extract IP addresses
          const ips =
            content.match(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g) || [];

          // Extract timestamps (ISO-like dates)
          const dates =
            content.match(/\d{4}-\d{2}-\d{2}[^<,"\n]+/g) || [];

          // Extract device/user agent strings
          const agents =
            content.match(
              /(Android|iPhone|Windows|Mac|Chrome|Instagram)[^<,"\n]*/gi
            ) || [];

          const max = Math.max(ips.length, dates.length, agents.length);
          setDebugInfo(
            `Found ${dates.length} dates, ${ips.length} IPs, ${agents.length} agents in ${fileName}`
          );

          for (let i = 0; i < max; i++) {
            results.push({
              timestamp: dates[i] || '',
              ip: ips[i] || '',
              userAgent: agents[i] || '',
              device: agents[i] || '',
            });
          }
        }
      }

      if (results.length > 0) {
        setActivities(results);
      } else {
        setDebugInfo(
          (prev) => prev + '\nNo activity data found in login files.'
        );
      }
      if (latestHtml) {
        setHtmlPreview(latestHtml);
      }
    } catch (e: any) {
      console.error('ZIP processing error:', e);
      setDebugInfo('Error: ' + (e?.message || String(e)));
    } finally {
      setLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#0F0F1A', '#1A0A2E', '#0F0F1A']}
        style={StyleSheet.absoluteFillObject}
      />
      <ScrollView
        contentContainerStyle={styles.scroll}
        showsVerticalScrollIndicator={false}
      >
        {/* ── Demo Section ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Instagram ZIP Viewer</Text>
          <Text style={styles.sectionSubtitle}>
            Upload your Instagram data export to preview extracted login
            activity. Data is parsed from embedded JSON in the raw HTML.
          </Text>

          <TouchableOpacity
            style={styles.uploadBtn}
            onPress={handleZipUpload}
            disabled={loading}
            activeOpacity={0.8}
          >
            <LinearGradient
              colors={['#E040FB', '#7C4DFF']}
              style={styles.uploadGradient}
            >
              <Ionicons name="cloud-upload" size={22} color="#fff" />
              <Text style={styles.uploadBtnText}>
                {loading ? 'Processing...' : 'Upload ZIP File'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* ── Loading ── */}
        {loading && (
          <View style={styles.loadingCard}>
            <ActivityIndicator size="small" color="#E040FB" />
            <Text style={styles.loadingText}>Processing ZIP file...</Text>
          </View>
        )}

        {/* ── ZIP File List ── */}
        {zipFiles.length > 0 && (
          <View style={styles.card}>
            <View style={styles.resultHeader}>
              <Ionicons name="folder-outline" size={18} color="#FFC107" />
              <Text style={styles.resultTitle}>ZIP Files</Text>
              <Text style={styles.resultCount}>{zipFiles.length}</Text>
            </View>
            <View style={styles.fileList}>
              {zipFiles.map((f) => (
                <Text key={f} style={styles.fileListItem} numberOfLines={1}>
                  {f}
                </Text>
              ))}
            </View>
          </View>
        )}

        {/* ── Debug Info ── */}
        {debugInfo ? (
          <View style={styles.debugCard}>
            <Text style={styles.debugText}>{debugInfo}</Text>
          </View>
        ) : null}

        {/* ── Login Activity Table ── */}
        {activities.length > 0 && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name="log-in-outline" size={18} color="#00BCD4" />
              <Text style={styles.resultTitle}>Extracted Login Activity</Text>
              <Text style={styles.resultCount}>{activities.length}</Text>
            </View>

            <View style={styles.tableHeader}>
              <Text style={[styles.tableHeaderCell, { flex: 1.2 }]}>
                Timestamp
              </Text>
              <Text style={[styles.tableHeaderCell, { flex: 0.8 }]}>IP</Text>
              <Text style={[styles.tableHeaderCell, { flex: 1 }]}>
                User Agent
              </Text>
            </View>

            {activities.map((a, i) => (
              <View
                key={i}
                style={[
                  styles.tableRow,
                  i % 2 === 0 && { backgroundColor: '#13131F' },
                ]}
              >
                <Text
                  style={[styles.tableCell, { flex: 1.2 }]}
                  numberOfLines={2}
                >
                  {a.timestamp || '-'}
                </Text>
                <Text style={[styles.tableCell, { flex: 0.8 }]} numberOfLines={1}>
                  {a.ip || '-'}
                </Text>
                <Text style={[styles.tableCell, { flex: 1 }]} numberOfLines={1}>
                  {a.userAgent || a.device || '-'}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* ── HTML Preview ── */}
        {htmlPreview && (
          <View style={styles.resultCard}>
            <View style={styles.resultHeader}>
              <Ionicons name="code-slash-outline" size={18} color="#FFC107" />
              <Text style={styles.resultTitle}>HTML Preview</Text>
            </View>
            <View style={styles.webviewWrap}>
              <WebView
                source={{ html: htmlPreview }}
                style={styles.webview}
                scrollEnabled
              />
            </View>
          </View>
        )}

        {/* ── How it Works ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>How it Works</Text>

          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {'// 1. Load ZIP with JSZip'}
              {'\n'}
              {'const zip = await JSZip.loadAsync(file);'}
              {'\n'}
              {"const allFiles = Object.keys(zip.files);"}
            </Text>
          </View>

          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {'// 2. Filter files containing "login"'}
              {'\n'}
              {"const loginFiles = allFiles.filter(f =>"}
              {'\n'}
              {"  f.toLowerCase().includes('login') &&"}
              {'\n'}
              {"  f.endsWith('.html')"}
              {'\n'}
              {');'}
            </Text>
          </View>

          <View style={styles.codeBlock}>
            <Text style={styles.codeText}>
              {'// 3. Extract data from raw HTML via regex'}
              {'\n'}
              {'const ips = content.match('}
              {'\n'}
              {'  /\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b/g'}
              {'\n'}
              {') || [];'}
              {'\n'}
              {'const dates = content.match('}
              {'\n'}
              {'  /\\d{4}-\\d{2}-\\d{2}[^<,"\\n]+/g'}
              {'\n'}
              {') || [];'}
              {'\n'}
              {'const agents = content.match('}
              {'\n'}
              {'  /(Android|iPhone|Windows|Mac)[^<,"\\n]*/gi'}
              {'\n'}
              {') || [];'}
            </Text>
          </View>

          <TouchableOpacity
            style={styles.toggleCodeBtn}
            onPress={() => setShowCode(!showCode)}
          >
            <Ionicons
              name={showCode ? 'chevron-up' : 'chevron-down'}
              size={16}
              color="#E040FB"
            />
            <Text style={styles.toggleCodeText}>
              {showCode ? 'Hide full source' : 'Show full source'}
            </Text>
          </TouchableOpacity>

          {showCode && (
            <View style={styles.codeBlock}>
              <Text style={styles.codeText}>
                {`export default function ZipViewerGuide() {
  const [activities, setActivities] = useState([]);

  const handleZipUpload = async () => {
    const zip = await loadZip();
    const loginFiles = Object.keys(zip.files)
      .filter(f => f.includes('login') && f.endsWith('.html'));

    const results = [];
    for (const name of loginFiles) {
      const content = await zip.files[name].async('text');

      const ips = content.match(
        /\\b\\d{1,3}(?:\\.\\d{1,3}){3}\\b/g
      ) || [];
      const dates = content.match(
        /\\d{4}-\\d{2}-\\d{2}[^<,"\\n]+/g
      ) || [];
      const agents = content.match(
        /(Android|iPhone|Windows|Mac)[^<,"\\n]*/gi
      ) || [];

      const max = Math.max(ips.length, dates.length, agents.length);
      for (let i = 0; i < max; i++) {
        results.push({
          timestamp: dates[i] || '',
          ip: ips[i] || '',
          userAgent: agents[i] || '',
          device: agents[i] || '',
        });
      }
    }
    setActivities(results);
  };
  // ... render table with Timestamp, IP, User Agent
}`}
              </Text>
            </View>
          )}
        </View>

        {/* ── Features ── */}
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Features</Text>
          <View style={styles.featureList}>
            {[
              { icon: 'cloud-upload-outline', text: 'Upload Instagram ZIP export' },
              { icon: 'folder-open-outline', text: 'Browse all files inside the ZIP' },
              { icon: 'search-outline', text: 'Extract login data from raw HTML via regex' },
              { icon: 'list-outline', text: 'Display login activity in React UI' },
              { icon: 'code-slash-outline', text: 'Preview raw HTML inside WebView' },
              { icon: 'globe-outline', text: 'Works fully in browser' },
            ].map((f, i) => (
              <View key={i} style={styles.featureRow}>
                <View style={styles.featureIconWrap}>
                  <Ionicons name={f.icon as any} size={16} color="#E040FB" />
                </View>
                <Text style={styles.featureText}>{f.text}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* ── Navigate to Upload ── */}
        <TouchableOpacity
          style={styles.navBtn}
          onPress={() => router.push('/upload')}
          activeOpacity={0.8}
        >
          <LinearGradient
            colors={['#E040FB', '#7C4DFF']}
            style={styles.navGradient}
          >
            <Ionicons name="arrow-forward" size={20} color="#fff" />
            <Text style={styles.navBtnText}>
              Go to Full Import & Insights
            </Text>
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0F0F1A' },
  scroll: { padding: 16, paddingBottom: 40, gap: 16 },
  card: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: '#2A2A40',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
    marginBottom: 6,
  },
  sectionSubtitle: {
    fontSize: 13,
    color: '#888',
    lineHeight: 20,
    marginBottom: 16,
  },
  uploadBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  uploadGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 10,
  },
  uploadBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  loadingCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 14,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1,
    borderColor: '#2A2A40',
  },
  loadingText: { color: '#E040FB', fontSize: 13, fontWeight: '600' },
  resultCard: {
    backgroundColor: '#1A1A2E',
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#2A2A40',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A40',
    gap: 8,
  },
  resultTitle: { color: '#fff', fontSize: 15, fontWeight: '700', flex: 1 },
  resultCount: {
    color: '#00BCD4',
    fontSize: 13,
    fontWeight: '800',
    backgroundColor: '#00BCD422',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 8,
    overflow: 'hidden',
  },
  fileList: {
    maxHeight: 200,
    padding: 12,
    gap: 4,
  },
  fileListItem: {
    color: '#888',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 18,
  },
  debugCard: {
    backgroundColor: '#2A1A1A',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FF525233',
  },
  debugText: {
    color: '#FF8A80',
    fontSize: 11,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    lineHeight: 16,
  },
  tableHeader: {
    flexDirection: 'row',
    backgroundColor: '#13131F',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A40',
  },
  tableHeaderCell: {
    color: '#666',
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#2A2A4011',
  },
  tableCell: { color: '#ccc', fontSize: 12 },
  webviewWrap: { height: 400, overflow: 'hidden' },
  webview: { flex: 1, backgroundColor: 'transparent' },
  codeBlock: {
    backgroundColor: '#0D0D1A',
    borderRadius: 12,
    padding: 14,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#2A2A40',
  },
  codeText: {
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    color: '#E040FB',
    lineHeight: 18,
  },
  toggleCodeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  toggleCodeText: { color: '#E040FB', fontSize: 13, fontWeight: '600' },
  featureList: { gap: 10, marginTop: 4 },
  featureRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  featureIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#E040FB22',
    alignItems: 'center',
    justifyContent: 'center',
  },
  featureText: { color: '#ccc', fontSize: 13, flex: 1 },
  navBtn: { borderRadius: 16, overflow: 'hidden' },
  navGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    gap: 8,
  },
  navBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
