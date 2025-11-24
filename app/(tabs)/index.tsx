import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av';
import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  Modal,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native';

// 🔴【重要】歌詞サーバーのIPアドレスを確認してここに書いてください
// WindowsのPowerShellで `ipconfig` を打って「IPv4 アドレス」を確認してください
const LYRICS_SERVER_IP = "10.41.0.148"; 

interface Track {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  previewUrl: string | null;
  externalUrl: string;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'favorites'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  // --- AsyncStorage ---
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const storedFavorites = await AsyncStorage.getItem('favorites_itunes');
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
        await AsyncStorage.setItem('favorites_itunes', JSON.stringify(favorites));
      } catch (e) {
        console.error('Failed to save favorites', e);
      }
    };
    saveFavorites();
  }, [favorites]);

  useEffect(() => {
    return () => {
      if (sound) sound.unloadAsync();
    };
  }, [sound]);

  // --- iTunes Search API 検索実行 (キー不要) ---
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('入力エラー', '曲名やアーティスト名を入力してください');
      return;
    }
    
    if (sound) {
      await sound.unloadAsync();
      setPlayingTrackId(null);
      setSound(null);
    }

    setIsLoading(true);
    setSearchResults([]);

    try {
      // iTunes APIを使用 (日本ストア JP, 上限20件)
      const response = await fetch(
        `https://itunes.apple.com/search?term=${encodeURIComponent(searchQuery)}&media=music&entity=song&limit=20&country=JP`
      );
      const data = await response.json();

      if (data.results) {
        const tracks: Track[] = data.results.map((item: any) => ({
          id: String(item.trackId),
          title: item.trackName,
          artist: item.artistName,
          albumArt: item.artworkUrl100, // 100x100の画像
          previewUrl: item.previewUrl,  // iTunesはプレビュー提供率が高い
          externalUrl: item.trackViewUrl,
        }));
        setSearchResults(tracks);
      } else {
        setSearchResults([]);
      }
    } catch (e) {
      console.error(e);
      Alert.alert('エラー', '検索中にエラーが発生しました');
    } finally {
      setIsLoading(false);
    }
  };

  // --- プレビュー再生 ---
  const togglePreview = async (track: Track) => {
    try {
      if (playingTrackId === track.id) {
        if (sound) {
          await sound.stopAsync();
          await sound.unloadAsync();
        }
        setPlayingTrackId(null);
        setSound(null);
        return;
      }

      if (!track.previewUrl) {
        Alert.alert('プレビュー不可', 'この曲は試聴データが提供されていません。');
        return;
      }

      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setPlayingTrackId(track.id);

      newSound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          setPlayingTrackId(null);
          newSound.unloadAsync();
          setSound(null);
        }
      });

    } catch (error) {
      console.error('Playback error', error);
      Alert.alert('エラー', '再生できませんでした');
    }
  };

  const toggleFavorite = (track: Track) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === track.id)) {
        return prev.filter((f) => f.id !== track.id);
      }
      return [...prev, track];
    });
  };

  // --- 歌詞取得 ---
  const fetchLyrics = async (title: string, artist: string) => {
    // サーバーIPの確認アラート（開発用：不要なら削除可）
    // Alert.alert('Debug', `Connecting to http://${LYRICS_SERVER_IP}:3000...`);

    try {
      setLyricsLoading(true);
      setLyrics(null);
      
      // タイムアウト設定付きのFetch
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000); // 5秒でタイムアウト

      const res = await fetch(
        `http://${LYRICS_SERVER_IP}:3000/lyrics?song=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);

      const data = await res.json();
      if (data.lyrics) setLyrics(data.lyrics);
      else if (data.error) setLyrics(`エラー: ${data.error}`);
      else setLyrics('歌詞が見つかりませんでした');
      setLyricsModalVisible(true);

    } catch (e: any) {
      console.error(e);
      let errorMsg = 'サーバーに接続できませんでした。';
      if (e.name === 'AbortError') errorMsg = '接続がタイムアウトしました。IPアドレスを確認してください。';
      Alert.alert('歌詞取得エラー', `${errorMsg}\n(IP: ${LYRICS_SERVER_IP})`);
    } finally {
      setLyricsLoading(false);
    }
  };

  const renderTrackItem = ({ item }: { item: Track }) => {
    const isFaved = favorites.some((f) => f.id === item.id);
    const isPlaying = playingTrackId === item.id;

    return (
      <View style={styles.listItem}>
        <View style={styles.trackInfoRow}>
          {item.albumArt && (
            <Image source={{ uri: item.albumArt }} style={styles.albumArt} />
          )}
          <View style={{ flex: 1 }}>
            <Text style={styles.trackTitle}>{item.title}</Text>
            <Text style={styles.trackArtist}>{item.artist}</Text>
          </View>
        </View>
        
        <View style={styles.buttonRow}>
          <TouchableOpacity 
            style={[styles.button, isPlaying ? styles.stopButton : styles.playButton]} 
            onPress={() => togglePreview(item)}
          >
            <Text style={styles.buttonText}>
              {isPlaying ? '■ 停止' : '▶ 試聴(30秒)'}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.button, isFaved && styles.favoriteButton]}
            onPress={() => toggleFavorite(item)}
          >
            <Text style={[styles.buttonText, isFaved && styles.favoriteButtonText]}>
              {isFaved ? '★ 解除' : '☆ 保存'}
            </Text>
          </TouchableOpacity>
          
          <TouchableOpacity
            style={[styles.button, styles.lyricsButton]}
            onPress={() => fetchLyrics(item.title, item.artist)}
          >
            <Text style={styles.buttonText}>📝 歌詞</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.title}>🎵 カラオケ思い出検索 (iTunes)</Text>

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
          <Text style={styles.tabText}>検索結果</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.tab, activeTab === 'favorites' && styles.activeTab]}
          onPress={() => setActiveTab('favorites')}
        >
          <Text style={styles.tabText}>リスト ({favorites.length})</Text>
        </TouchableOpacity>
      </View>

      {activeTab === 'search' ? (
        isLoading ? (
          <ActivityIndicator size="large" color="#FF2D55" style={{ marginTop: 20 }} />
        ) : (
          <FlatList
            data={searchResults}
            renderItem={renderTrackItem}
            keyExtractor={(item) => item.id}
            contentContainerStyle={{ paddingBottom: 100 }}
            ListEmptyComponent={<Text style={styles.emptyText}>曲を検索してください</Text>}
          />
        )
      ) : (
        <FlatList
          data={favorites}
          renderItem={renderTrackItem}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 100 }}
          ListEmptyComponent={<Text style={styles.emptyText}>まだ保存された曲はありません</Text>}
        />
      )}

      <Modal
        visible={lyricsModalVisible}
        animationType="slide"
        onRequestClose={() => setLyricsModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
          {lyricsLoading ? (
            <ActivityIndicator size="large" color="#FF2D55" style={{ marginTop: 20 }} />
          ) : (
            <ScrollView>
              <Text style={{ color: '#fff', fontSize: 18, lineHeight: 28, textAlign:'center' }}>{lyrics}</Text>
            </ScrollView>
          )}
          <TouchableOpacity
            style={{ marginTop: 20, backgroundColor: '#555', padding: 12, borderRadius: 8 }}
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
  container: { flex: 1, backgroundColor: '#121212', paddingHorizontal: 16 },
  title: { color: '#fff', fontSize: 22, fontWeight: 'bold', textAlign: 'center', marginVertical: 20 },
  searchSection: { flexDirection: 'row', alignItems: 'center', marginBottom: 15 },
  input: { flex: 1, backgroundColor: '#333', color: '#fff', paddingHorizontal: 15, paddingVertical: 10, borderRadius: 8, marginRight: 10, fontSize: 16 },
  searchButton: { backgroundColor: '#FF2D55', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  tabButtons: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, marginHorizontal: 5, backgroundColor: '#333' },
  activeTab: { backgroundColor: '#FF2D55' }, // Apple Music Color
  tabText: { color: '#fff', fontWeight: 'bold' },
  
  listItem: { backgroundColor: '#282828', padding: 12, borderRadius: 8, marginBottom: 10 },
  trackInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  albumArt: { width: 50, height: 50, borderRadius: 4, marginRight: 12 },
  trackTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  trackArtist: { color: '#b3b3b3', fontSize: 14, marginTop: 4 },
  
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { padding: 8, borderRadius: 6, flex: 1, alignItems: 'center', marginRight: 5, backgroundColor: '#3E3E3E' },
  playButton: { backgroundColor: '#FF2D55' }, 
  stopButton: { backgroundColor: '#e91e63' },
  favoriteButton: { backgroundColor: 'gold' },
  favoriteButtonText: { color: '#000' },
  lyricsButton: { backgroundColor: '#555', marginRight: 0 }, 
  
  emptyText: { color: '#999', textAlign: 'center', marginTop: 40, fontSize: 16 },
});