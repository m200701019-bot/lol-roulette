import React, { useEffect, useMemo, useRef, useState } from "react";

// ==========================================
// LoL 5人ランダムルーレット — 完全版（語尾＋手動停止対応）
// - 最新パッチ（Data Dragon）からデータ取得
// - 5人同時表示（チャンピオン/レーンは重複なし）
// - 初手アイテムは完成品(レジェンダリー相当)のみ、JGスターター除外
// - ルーレット演出（スピン表示）＋可愛い効果音
// - 各プレイヤーは自身で『止める』ボタンを押して停止（任意の順番で停止可能）
// - フィルターに「語尾を追加」を実装。ONなら語尾を5つランダムに選んで各プレイヤーにかぶりなしで付与
// ==========================================

const LANE_PRESETS = [
  { id: "TOP", label: "トップ" },
  { id: "JUNGLE", label: "ジャングル" },
  { id: "MID", label: "ミッド" },
  { id: "BOT", label: "ボット(ADC)" },
  { id: "SUPPORT", label: "サポート" },
];

const GYAZO_SPRITE = "https://i.gyazo.com/80a41f16a9a7f0cebafcb3f8b4fdc787.png";

const LaneIcon = ({ id, size = 24 }) => {
  const urls = {
    TOP: 'https://i.gyazo.com/7b8fda7c5873adecb9952a7976d742e2.png',
    JUNGLE: 'https://i.gyazo.com/d68e04b23e0e4617e48e0219d7983132.png',
    MID: 'https://i.gyazo.com/b88e74e904103df27ed3866a2b82a5c2.png',
    BOT: 'https://i.gyazo.com/9011ad799d088a97df37937de33a82e6.png',
    SUPPORT: 'https://i.gyazo.com/a639850e73ae36d6296e339f62ed30d6.png',
  };
  const src = urls[id] || urls.MID;
  return (
    <img
      src={src}
      alt={id}
      style={{ width: size, height: size, objectFit: 'contain', display: 'inline-block', borderRadius: 6 }}
    />
  );
};

// 語尾リスト（重複は除外）
const SUFFIXES = Array.from(new Set([
  'ドン！','だっちゃ','ナリ','おじゃ','ザンス','なのだ','ブー','だってばよ','なのら','でやんす','ですぅ♡','にゃ','でちゅ','ぷん','ぴょん','ござる','だべぇ','ダゾ','ばぶ','ですわ','でちゅ'
]));

function useDDragon() {
  const [version, setVersion] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [champions, setChampions] = useState([]);
  const [items, setItems] = useState([]);
  const [keystones, setKeystones] = useState([]);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setLoading(true);
      setError("");
      try {
        const vRes = await fetch("https://ddragon.leagueoflegends.com/api/versions.json");
        const versions = await vRes.json();
        const ver = versions?.[0];
        if (!ver) throw new Error("バージョンが取得できませんでした");
        if (canceled) return;
        setVersion(ver);
        const base = `https://ddragon.leagueoflegends.com/cdn/${ver}/data/ja_JP`;

        const cRes = await fetch(`${base}/champion.json`);
        const cJson = await cRes.json();
        const cList = Object.values(cJson.data || {}).map((c) => ({
          id: c.id,
          key: c.key,
          name: c.name,
          title: c.title,
          tags: c.tags,
          image: c.image || null,
        }));

        const iRes = await fetch(`${base}/item.json`);
        const iJson = await iRes.json();
        const iList = Object.entries(iJson.data || {}).map(([id, it]) => ({
          id,
          name: it.name,
          plaintext: it.plaintext,
          tags: it.tags || [],
          maps: it.maps || {},
          gold: it.gold || {},
          image: it.image || null,
          inStore: it.inStore,
          consumed: it.consumed,
          into: it.into || [],
          from: it.from || [],
          requiredChampion: it.requiredChampion,
          requiredAlly: it.requiredAlly,
        }));

        const rRes = await fetch(`${base}/runesReforged.json`);
        const trees = await rRes.json();
        const ks = [];
        for (const tree of trees || []) {
          const slot0 = tree.slots?.[0];
          if (slot0?.runes) {
            for (const r of slot0.runes) {
              ks.push({ id: r.id, name: r.name, icon: r.icon, tree: tree.name });
            }
          }
        }

        if (canceled) return;
        setChampions(cList);
        setItems(iList);
        setKeystones(ks);
      } catch (e) {
        if (!canceled) setError(e?.message || String(e));
      } finally {
        if (!canceled) setLoading(false);
      }
    }
    load();
    return () => { canceled = true; };
  }, []);

  return { version, champions, items, keystones, loading, error, reload: () => window.location.reload() };
}

const defaultFilters = {
  onlySR: true,
  excludeTrinket: true,
  excludeConsumable: true,
  excludeBoots: true,
  onlyCompletedLegendary: true,
  excludeJungleStarter: true,
  suffixEnabled: true,
};

function sample(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function sampleUnique(arr, n) {
  const pool = [...arr];
  const out = [];
  while (out.length < n && pool.length) {
    const i = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(i, 1)[0]);
  }
  return out;
}

function isCompletedLegendaryLike(it) {
  const intoEmpty = !it.into || it.into.length === 0;
  const hasComponents = Array.isArray(it.from) && it.from.length > 0;
  const notFree = (it.gold?.total ?? 0) >= 1800;
  const notSpecialBind = !it.requiredChampion && !it.requiredAlly;
  return intoEmpty && hasComponents && notFree && notSpecialBind;
}

function isJungleStarter(it) {
  const tags = it.tags || [];
  const text = `${it.name || ""} ${it.plaintext || ""}`;
  const jungleTag = tags.includes("Jungle");
  const byWord = /Jungle|ジャングル|Smite|スマイト/i.test(text);
  return jungleTag || byWord;
}

export default function App() {
  const { version, champions, items, keystones, loading, error, reload } = useDDragon();

  const [filters, setFilters] = useState(defaultFilters);

  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (filters.onlySR && it.maps && it.maps["11"] === false) return false;
      const tags = it.tags || [];
      if (filters.excludeTrinket && tags.includes("Trinket")) return false;
      if (filters.excludeConsumable && tags.includes("Consumable")) return false;
      if (filters.excludeBoots && tags.includes("Boots")) return false;
      if (filters.excludeJungleStarter && isJungleStarter(it)) return false;
      if (filters.onlyCompletedLegendary && !isCompletedLegendaryLike(it)) return false;
      if (it.inStore === false) return false;
      if ((it.gold?.total ?? 0) <= 0) return false;
      return true;
    });
  }, [items, filters]);

  const [displayPlayers, setDisplayPlayers] = useState(Array(5).fill(null));
  const finalPlayersRef = useRef(Array(5).fill(null));
  const [stopped, setStopped] = useState([false, false, false, false, false]);
  const stoppedRef = useRef([false, false, false, false, false]);
  const spinningRef = useRef(false);
  const spinIntervalRef = useRef(null);
  const tickIntervalRef = useRef(null);
  const timersRef = useRef([]);

  const audioCtxRef = useRef(null);
  function getCtx() {
    if (!audioCtxRef.current) {
      const AC = window.AudioContext || window.webkitAudioContext;
      audioCtxRef.current = AC ? new AC() : null;
    }
    return audioCtxRef.current;
  }
  async function ensureAudio() {
    const ctx = getCtx();
    if (ctx && ctx.state === "suspended") await ctx.resume();
    return ctx;
  }
  function beep({ freq = 1000, dur = 0.04, type = "sine", gain = 0.02 } = {}) {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(gain, now);
    o.connect(g).connect(ctx.destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    o.stop(now + dur);
  }
  function popCute() {
    const ctx = getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = "triangle";
    o.frequency.setValueAtTime(900, now);
    o.frequency.exponentialRampToValueAtTime(420, now + 0.12);
    g.gain了解です。現在の `App.js` に「各プレイヤー枠に『再リロール（1回のみ）』ボタン」を追加する場合、以下の変更を加えます：

1. **再リロール用の状態を追加**  
各プレイヤーごとに再リロールが可能かどうかを記録する配列を用意します。

```javascript
const [rerollUsed, setRerollUsed] = useState([false, false, false, false, false]);
