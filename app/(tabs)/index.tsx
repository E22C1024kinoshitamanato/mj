import AsyncStorage from '@react-native-async-storage/async-storage';
import { Audio } from 'expo-av'; // 音声再生用
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

// 🔴【重要】ここにSpotifyで取得したIDとSecretを貼り付けてください
const SPOTIFY_CLIENT_ID = 'あなたのCLIENT_ID';
const SPOTIFY_CLIENT_SECRET = 'あなたのCLIENT_SECRET';

interface Track {
  id: string;
  title: string;
  artist: string;
  albumArt: string;
  previewUrl: string | null; // 30秒プレビューURL
  externalUrl: string; // Spotifyアプリを開く用
}

export default function App() {
  const [activeTab, setActiveTab] = useState<'search' | 'favorites'>('search');
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Track[]>([]);
  const [favorites, setFavorites] = useState<Track[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  // 音声再生用
  const [sound, setSound] = useState<Audio.Sound | null>(null);
  const [playingTrackId, setPlayingTrackId] = useState<string | null>(null);

  const [lyrics, setLyrics] = useState<string | null>(null);
  const [lyricsModalVisible, setLyricsModalVisible] = useState(false);
  const [lyricsLoading, setLyricsLoading] = useState(false);

  // --- AsyncStorage (お気に入り保存) ---
  useEffect(() => {
    const loadFavorites = async () => {
      try {
        const storedFavorites = await AsyncStorage.getItem('favorites_spotify');
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
        await AsyncStorage.setItem('favorites_spotify', JSON.stringify(favorites));
      } catch (e) {
        console.error('Failed to save favorites', e);
      }
    };
    saveFavorites();
  }, [favorites]);

  // --- 音声リソースの解放 ---
  useEffect(() => {
    return () => {
      if (sound) {
        sound.unloadAsync();
      }
    };
  }, [sound]);

  // --- Spotify Token 取得 ---
  const getSpotifyToken = async () => {
    const details = {
      grant_type: 'client_credentials',
      client_id: SPOTIFY_CLIENT_ID,
      client_secret: SPOTIFY_CLIENT_SECRET
    };
    
    // form-urlencoded形式に変換
    const formBody = Object.keys(details)
      .map(key => encodeURIComponent(key) + '=' + encodeURIComponent(details[key as keyof typeof details]))
      .join('&');

    try {
      const response = await fetch('https://accounts.spotify.com/api/token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
        },
        body: formBody,
      });
      const data = await response.json();
      return data.access_token;
    } catch (error) {
      console.error('Token fetch error', error);
      return null;
    }
  };

  // --- Spotify 検索実行 ---
  const handleSearch = async () => {
    if (!searchQuery.trim()) {
      Alert.alert('入力エラー', '曲名やアーティスト名を入力してください');
      return;
    }
    
    // 音声が再生中なら止める
    if (sound) {
      await sound.unloadAsync();
      setPlayingTrackId(null);
      setSound(null);
    }

    setIsLoading(true);
    setSearchResults([]);

    try {
      const token = await getSpotifyToken();
      if (!token) throw new Error('トークンの取得に失敗しました');

      const response = await fetch(
        `https://api.spotify.com/v1/search?q=${encodeURIComponent(searchQuery)}&type=track&limit=20&market=JP`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );
      const data = await response.json();

      if (data.tracks && data.tracks.items) {
        const tracks: Track[] = data.tracks.items.map((item: any) => ({
          id: item.id,
          title: item.name,
          artist: item.artists.map((a: any) => a.name).join(', '),
          albumArt: item.album.images[0]?.url || null, // ジャケット画像
          previewUrl: item.preview_url, // 30秒プレビューURL (ない場合もある)
          externalUrl: item.external_urls.spotify,
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

  // --- プレビュー再生 / 停止 ---
  const togglePreview = async (track: Track) => {
    try {
      // 既に再生中の曲をタップした場合 -> 停止
      if (playingTrackId === track.id) {
        if (sound) {
          await sound.stopAsync();
          await sound.unloadAsync();
        }
        setPlayingTrackId(null);
        setSound(null);
        return;
      }

      // 別の曲、または停止中にタップした場合 -> 再生
      if (!track.previewUrl) {
        Alert.alert('プレビュー不可', 'この曲はSpotify上で30秒試聴が提供されていません。');
        return;
      }

      // 既存の再生があれば止める
      if (sound) {
        await sound.unloadAsync();
      }

      const { sound: newSound } = await Audio.Sound.createAsync(
        { uri: track.previewUrl },
        { shouldPlay: true }
      );
      
      setSound(newSound);
      setPlayingTrackId(track.id);

      // 再生終了時の処理
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

  // --- お気に入り切り替え ---
  const toggleFavorite = (track: Track) => {
    setFavorites((prev) => {
      if (prev.some((f) => f.id === track.id)) {
        return prev.filter((f) => f.id !== track.id);
      }
      return [...prev, track];
    });
  };

  // --- 歌詞取得 (既存機能維持) ---
  const fetchLyrics = async (title: string, artist: string) => {
    // 省略せずに既存と同じロジックを使用
    // サーバーIPなどは環境に合わせて変更してください
    const serverIP = "10.41.0.148"; 
    try {
      setLyricsLoading(true);
      setLyrics(null);
      const res = await fetch(`http://${serverIP}:3000/lyrics?song=${encodeURIComponent(title)}&artist=${encodeURIComponent(artist)}`);
      const data = await res.json();
      if (data.lyrics) setLyrics(data.lyrics);
      else if (data.error) setLyrics(`エラー: ${data.error}`);
      else setLyrics('歌詞が見つかりませんでした');
      setLyricsModalVisible(true);
    } catch (e) {
      Alert.alert('エラー', '歌詞取得エラー');
    } finally {
      setLyricsLoading(false);
    }
  };

  // --- リスト項目の描画 ---
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
          {/* 再生ボタン */}
          <TouchableOpacity 
            style={[styles.button, isPlaying ? styles.stopButton : styles.playButton]} 
            onPress={() => togglePreview(item)}
          >
            <Text style={styles.buttonText}>
              {isPlaying ? '■ 停止' : '▶ 試聴(30秒)'}
            </Text>
          </TouchableOpacity>

          {/* お気に入りボタン */}
          <TouchableOpacity
            style={[styles.button, isFaved && styles.favoriteButton]}
            onPress={() => toggleFavorite(item)}
          >
            <Text style={[styles.buttonText, isFaved && styles.favoriteButtonText]}>
              {isFaved ? '★ 解除' : '☆ 保存'}
            </Text>
          </TouchableOpacity>
          
          {/* 歌詞ボタン */}
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
      <Text style={styles.title}>🎵 カラオケ思い出検索 (Spotify)</Text>

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
          <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 20 }} />
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

      {/* 歌詞モーダル */}
      <Modal
        visible={lyricsModalVisible}
        animationType="slide"
        onRequestClose={() => setLyricsModalVisible(false)}
      >
        <SafeAreaView style={{ flex: 1, backgroundColor: '#000', padding: 16 }}>
          {lyricsLoading ? (
            <ActivityIndicator size="large" color="#1DB954" style={{ marginTop: 20 }} />
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
  searchButton: { backgroundColor: '#1DB954', paddingHorizontal: 15, paddingVertical: 12, borderRadius: 8 },
  buttonText: { color: '#fff', fontWeight: 'bold', fontSize: 12 },
  tabButtons: { flexDirection: 'row', justifyContent: 'center', marginBottom: 15 },
  tab: { paddingVertical: 8, paddingHorizontal: 20, borderRadius: 20, marginHorizontal: 5, backgroundColor: '#333' },
  activeTab: { backgroundColor: '#1DB954' },
  tabText: { color: '#fff', fontWeight: 'bold' },
  
  listItem: { backgroundColor: '#282828', padding: 12, borderRadius: 8, marginBottom: 10 },
  trackInfoRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  albumArt: { width: 50, height: 50, borderRadius: 4, marginRight: 12 },
  trackTitle: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  trackArtist: { color: '#b3b3b3', fontSize: 14, marginTop: 4 },
  
  buttonRow: { flexDirection: 'row', justifyContent: 'space-between' },
  button: { padding: 8, borderRadius: 6, flex: 1, alignItems: 'center', marginRight: 5, backgroundColor: '#3E3E3E' },
  playButton: { backgroundColor: '#1DB954' }, // Spotify Green
  stopButton: { backgroundColor: '#e91e63' },
  favoriteButton: { backgroundColor: 'gold' },
  favoriteButtonText: { color: '#000' },
  lyricsButton: { backgroundColor: '#555', marginRight: 0 }, // 歌詞ボタン
  
  emptyText: { color: '#999', textAlign: 'center', marginTop: 40, fontSize: 16 },
});