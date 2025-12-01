const express = require('express');
const cors = require('cors');
const Genius = require("genius-lyrics");

const app = express();
const port = 3000;

const Client = new Genius.Client();

app.use(cors());

// 曲名から括弧やハイフン以降の余分な情報を削除する関数
function cleanText(text) {
    if (!text) return "";
    return text
        .replace(/\s*[\(\[\-].*$/, '') 
        .trim();
}

app.get('/lyrics', async (req, res) => {
    const { song, artist } = req.query;
    console.log(`\n[REQUEST] ${artist} - ${song}`);

    if (!song) {
        return res.status(400).json({ error: '曲名が必要です' });
    }

    try {
        const cleanedSong = cleanText(song); 

        // 1回目の検索: アーティスト名 + 曲名
        let searchQuery = `${artist} ${cleanedSong}`;
        console.log(`Searching Genius for (Attempt 1): ${searchQuery}`);
        
        let searches = await Client.songs.search(searchQuery);

        // 💡 修正点: 1回目でヒットしなかった場合、曲名だけで再検索する
        if (searches.length === 0) {
            console.log('--> アーティスト名込みで見つかりませんでした。曲名のみで再検索します...');
            console.log(`Searching Genius for (Attempt 2): ${cleanedSong}`);
            searches = await Client.songs.search(cleanedSong);
        }

        if (searches.length === 0) {
            console.log('--> Geniusで見つかりませんでした (完全敗北)');
            return res.json({ url: null });
        }

        let finalUrl = null;

        // ローマ字表記のURLを避けるロジック
        for (let i = 0; i < Math.min(searches.length, 5); i++) {
            const currentSong = searches[i];
            // 曲名が極端に違うものが混ざるのを防ぐため、簡易チェックを入れても良いですが、
            // いったんはURLチェックのみ行います
            if (!currentSong.url.includes('romanizations')) {
                finalUrl = currentSong.url;
                console.log(`--> Found BEST URL: ${finalUrl}`);
                break;
            }
        }

        if (!finalUrl) {
            finalUrl = searches[0].url; 
            console.log(`--> Fallback to first URL: ${finalUrl}`);
        }

        res.json({ url: finalUrl });

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