const express = require('express');
const cors = require('cors');
const Genius = require("genius-lyrics");

const app = express();
const port = 3000;

// Geniusクライアントの初期化
const Client = new Genius.Client();

app.use(cors());

app.get('/lyrics', async (req, res) => {
    const { song, artist } = req.query;
    console.log(`\n[REQUEST] ${artist} - ${song}`);

    if (!song) {
        return res.status(400).json({ error: '曲名が必要です' });
    }

    try {
        // アーティスト名 + 曲名 でGeniusを検索
        const searchQuery = `${artist} ${song}`;
        console.log(`Searching Genius for: ${searchQuery}`);
        
        const searches = await Client.songs.search(searchQuery);

        if (searches.length === 0) {
            console.log('--> Geniusで見つかりませんでした');
            return res.json({ url: null });
        }

        // 一番上の検索結果を取得
        const firstSong = searches[0];
        console.log(`--> Found URL: ${firstSong.url}`);

        // ★重要: 歌詞テキストではなく、ページのURLを返す
        res.json({ url: firstSong.url });

    } catch (error) {
        console.error('Genius Error:', error);
        res.json({ error: error.message });
    }
});

app.listen(port, '0.0.0.0', () => {
    console.log(`--------------------------------------------------`);
    console.log(`Lyrics Link Server running at http://localhost:${port}`);
    console.log(`--------------------------------------------------`);
});