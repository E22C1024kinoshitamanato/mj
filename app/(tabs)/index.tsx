import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';
import YoutubeIframe from 'react-native-youtube-iframe';

const API_KEY = "AIzaSyBKwVHpKdPr5QA32UgtOvg_XTN1oESWwJI";

interface Video {
  title: string;
  channel: string;
  videoId: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'favorites'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Video[]>([]);
  const [favorites, setFavorites] = useState<Video[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [playingVideoId, setPlayingVideoId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  const playerRef = useRef(null);

  // --- AsyncStorage ---
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const storedFavorites = await AsyncStorage.getItem('favorites');
        if (storedFavorites) setFavorites(JSON.parse(storedFavorites));
      } catch (e) {
        console.error('Failed to load favorites', e);
      }
    };
    loadFavorites();
  }, []);

  useEffect(() => {
    const saveFavorites = async () => {
      try {
        await AsyncStorage.setItem('favorites', JSON.stringify(favorites));
      } catch (e) {
        console.error('Failed to save favorites', e);
      }
    };
    saveFavorites();
  }, [favorites]);

  // --- YouTube API ---
  const searchYouTube = async (query: string): Promise<Video[]> => {
    try {
      const searchURL = `https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=10&q=${encodeURIComponent(query)}&key=${API_KEY}`;
      const res = await fetch(searchURL);
      const data = await res.json();
      if (!data.items) return [];
 
      const videoIds = data.items.map((item: any) => item.id.videoId).join(',');
      const statusURL = `https://www.googleapis.com/youtube/v3/videos?part=status,snippet&id=${videoIds}&key=${API_KEY}`;
      const statusRes = await fetch(statusURL);
      const statusData = await statusRes.json();

      const embeddableVideos = statusData.items.filter((v: any) => v.status.embeddable);

      return embeddableVideos.map((v: any) => ({
        title: v.snippet.title,
        channel: v.snippet.channelTitle,
        videoId: v.id,
      }));
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '検索中にエラーが発生しました');
      return [];
    }
  };

  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('入力エラー', '検索ワードを入力してください');
      return;
    }
    setIsLoading(true);
    setSearchResults([]);
    setPlayingVideoId(null);
    const videos = await searchYouTube(searchQuery);
    setSearchResults(videos);
    setIsLoading(false);
  };

  // --- お気に入り ---
  const toggleFavorite = (video: Video) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.videoId === video.videoId)) {
        return prev.filter((f) => f.videoId !== video.videoId);
      }
      return [...prev, video];
    });
  };

  // --- 再生 / 一時停止 ---
  const togglePlay = (videoId: string) => {
    if (playingVideoId === videoId) {
      setIsPlaying((prev) => !prev);
    } else {
      setIsPlaying(false);
      setPlayingVideoId(videoId);
      setTimeout(() => setIsPlaying(true), 100);
    }
  };

  // --- Node.js サーバー経由で歌詞取得 ---
  const fetchLyrics = async (title: string, artist: string) => {
    try {
      setLyricsLoading(true);
      setLyrics(null);

      const serverIP = "10.41.0.148"; // Node.js サーバーのIP
      const res = await fetch(`http://${serverIP}:3000/lyrics?song=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
      const data = await res.json();

      if (data.lyrics) {
        setLyrics(data.lyrics);
      } else if (data.error) {
        setLyrics(`エラー: ${data.error}`);
      } else {
        setLyrics('歌詞が見つかりませんでした');
      }

      setLyricsModalVisible(true);
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '歌詞取得中にエラーが発生しました');
    } finally {
      setLyricsLoading(false);
    }
  };

  // --- 動画リストレンダリング ---
  const renderVideoItem = ({ item }: { item: Video }) => {
    const isFaved = favorites.some((f) => f.videoId === item.videoId);
    return (
      <View style={styles.listItem}>
        <Text style={styles.videoTitle}>{item.title}</Text>
        <Text style={styles.videoChannel}>{item.channel}</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.button} onPress={() => togglePlay(item.videoId)}>
            <Text style={styles.buttonText}>▶ 再生/停止</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.button, isFaved && styles.favoriteButton]}
            onPress={() => toggleFavorite(item)}
          >
            <Text style={[styles.buttonText, isFaved && styles.favoriteButtonText]}>
              {isFaved ? '⭐ お気に入り解除' : '⭐ お気に入り'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.button}
            onPress={() => fetchLyrics(item.title, item.channel)}
          >
            <Text style={styles.buttonText}>📝 歌詞</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>🎵 カラオケ曲検索プレイヤー</Text>

      <View style={styles.searchSection}>
        <TextInput
          style={styles.input}
          placeholder="曲名やアーティストを入力"
          placeholderTextColor="#888"
          value={searchQuery}
          onChangeText={setSearchQuery}
          onSubmitEditing={handleSearch}
        />
        <TouchableOpacity style={styles.searchButton} onPress={handleSearch}>
          <Text style={styles.buttonText}>検索</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.tabButtons}>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'search' && styles.activeTab]}
          onPress={() => setActiveTab('search')}
        >
          <Text style={styles.tabText}>検索ページ</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.activeTab]}
          onPress={() => setActiveTab('favorites')}
        >
          <Text style={styles.tabText}>お気に入りページ</Text>
        </TouchableOpacity>
      </View>

      {playingVideoId && (
        <View style={styles.videoPlayerContainer}>
          <YoutubeIframe
            ref={playerRef}
            height={220}
            videoId={playingVideoId}
            play={isPlaying}
            onReady={() => setIsPlaying(true)}
            onChangeState={(event) => {
              if (event === 'ended') {
                setIsPlaying(false);
                setPlayingVideoId(null);
              }
            }}
          />
        </View>
      )}

      {activeTab === 'search' ? (
        isLoading ? (
          <ActivityIndicator size="large" color="#ff0000" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={searchResults}
            renderItem={renderVideoItem}
            keyExtractor={(item) => item.videoId}
            ListEmptyComponent={<Text style={styles.emptyText}>埋め込み可能な動画が見つかりませんでした</Text>}
          />
        )
      ) : (
        <FlatList
          data={favorites}
          renderItem={renderVideoItem}
          keyExtractor={(item) => item.videoId}
          ListEmptyComponent={<Text style={styles.emptyText}>お気に入りはまだありません</Text>}
        />
      )}

      {/* --- 歌詞モーダル --- */}
      <Modal
        visible={lyricsModalVisible}
        animationType="slide"
        onRequestClose={() => setLyricsModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
          {lyricsLoading ? (
            <ActivityIndicator size="large" color="#ff0000" style={{ marginTop: 20 }} />
          ) : (
            <ScrollView>
              <Text style={{ color: '#fff', fontSize: 16, lineHeight: 24 }}>{lyrics}</Text>
            </ScrollView>
          )}
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: '#ff0000', padding: 12, borderRadius: 8 }}
            onPress={() => setLyricsModalVisible(false)}
          >
            <Text style={{ color: '#fff', textAlign: 'center', fontWeight: 'bold' }}>閉じる</Text>
          </TouchableOpacity>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#000', paddingHorizontal: 16 },
  title: { color: '#fff', fontSize: 24, fontWeight: 'bold', textAlign: 'center', marginVertical: 20 },
  searchSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  input: { flex: 1, backgroundColor: '#333', color: '#fff', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, marginRight: 10, fontSize: 16 },
  searchButton: { backgroundColor: '#ff0000', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  tabButtons: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  tab: { paddingVertical: 10, paddingHorizontal: 20, borderRadius: 8, marginHorizontal: 5, backgroundColor: '#555' },
  activeTab: { backgroundColor: '#ff6666' },
  tabText: { color: '#fff', fontWeight: 'bold' },
  listItem: { backgroundColor: 'rgba(255, 255, 255, 0.1)', padding: 15, borderRadius: 8, marginBottom: 10 },
  videoTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  videoChannel: { color: '#ccc', fontSize: 14, marginTop: 4, marginBottom: 12 },
  buttonRow: { flexDirection: 'row', marginTop: 8 },
  button: { backgroundColor: '#ff0000', padding: 8, borderRadius: 8, marginRight: 10 },
  favoriteButton: { backgroundColor: 'gold' },
  favoriteButtonText: { color: '#000' },
  emptyText: { color: '#999', textAlign: 'center', marginTop: 40, fontSize: 16 },
  videoPlayerContainer: { marginVertical: 10 },
});
