'use client';

import { FormEvent, useMemo, useState } from "react";

type CardStyle = "serene" | "minimal" | "vibrant";

const CARD_STYLES: Record<CardStyle, { label: string; description: string }> = {
  serene: {
    label: "静寂",
    description: "柔らかな青とピンクで湖面の余韻を演出。"
  },
  minimal: {
    label: "ミニマル",
    description: "潔い余白とタイポでスコアを際立たせる。"
  },
  vibrant: {
    label: "煌き",
    description: "暖色のグラデーションでドラマチックに。"
  }
};

const apiBase = process.env.NEXT_PUBLIC_API_URL;

export default function HomePage() {
  const [cardStyle, setCardStyle] = useState<CardStyle>("serene");
  const [score, setScore] = useState<string>("82");
  const [time, setTime] = useState<string>("18:45");
  const [spot, setSpot] = useState<string>("宍道湖・夕日スポット");
  const [imageUrl, setImageUrl] = useState<string>("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previewGradient = useMemo(() => {
    switch (cardStyle) {
      case "minimal":
        return "from-slate-100/40 to-slate-400/20 text-slate-900";
      case "vibrant":
        return "from-yellow-400/60 via-orange-500/70 to-rose-500/80 text-white";
      default:
        return "from-indigo-900/80 via-sky-500/40 to-rose-400/40 text-slate-100";
    }
  }, [cardStyle]);

  const handleGenerate = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    if (!apiBase) {
      setError("APIエンドポイントが設定されていません (.env.local を確認してください)");
      return;
    }
    try {
      setLoading(true);
      const response = await fetch(`${apiBase}/generate-card`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          style: cardStyle,
          score,
          time,
          spot
        })
      });

      if (!response.ok) {
        throw new Error(`カード生成に失敗しました (${response.status})`);
      }

      const data = await response.json();
      setImageUrl(data.imageUrl);
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const fetchScore = async () => {
    if (!apiBase) {
      setError("APIエンドポイントが設定されていません (.env.local を確認してください)");
      return;
    }
    try {
      setError(null);
      setLoading(true);
      const response = await fetch(`${apiBase}/sunset-score`);
      if (!response.ok) {
        throw new Error(`スコア取得に失敗しました (${response.status})`);
      }
      const payload = await response.json();
      setScore(String(Math.round(payload.score)));
    } catch (err) {
      console.error(err);
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-8 p-6 md:flex-row md:py-12">
      <section className="glass-panel flex-1 rounded-3xl p-8">
        <header className="mb-8">
          <h1 className="text-3xl font-semibold">Sunset Card Generator</h1>
          <p className="mt-2 text-sm text-slate-200/80">
            スタイルと情報を調整して、宍道湖の夕景カードを生成しましょう。
          </p>
        </header>

        <form className="space-y-8" onSubmit={handleGenerate}>
          <div>
            <h2 className="text-lg font-medium text-slate-100">スタイル</h2>
            <div className="mt-3 grid gap-3 md:grid-cols-3">
              {Object.entries(CARD_STYLES).map(([key, value]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setCardStyle(key as CardStyle)}
                  className={`rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition hover:border-white/30 ${
                    cardStyle === key ? "ring-2 ring-amber-300/90" : ""
                  }`}
                >
                  <p className="text-base font-semibold">{value.label}</p>
                  <p className="text-xs text-slate-200/70">{value.description}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            <label className="flex flex-col gap-2">
              <span className="text-sm text-slate-100">スコア (0-100)</span>
              <input
                type="number"
                min={0}
                max={100}
                value={score}
                onChange={(event) => setScore(event.target.value)}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-slate-900 focus:border-amber-300 focus:outline-none"
              />
            </label>
            <label className="flex flex-col gap-2">
              <span className="text-sm text-slate-100">日の入り時刻</span>
              <input
                type="time"
                value={time}
                onChange={(event) => setTime(event.target.value)}
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-slate-900 focus:border-amber-300 focus:outline-none"
              />
            </label>
            <label className="md:col-span-2 flex flex-col gap-2">
              <span className="text-sm text-slate-100">スポット</span>
              <input
                type="text"
                value={spot}
                onChange={(event) => setSpot(event.target.value)}
                placeholder="宍道湖夕日スポット"
                className="rounded-xl border border-white/10 bg-white/10 px-3 py-3 text-slate-900 focus:border-amber-300 focus:outline-none"
              />
            </label>
          </div>

          <div className="flex flex-col gap-3 md:flex-row">
            <button
              type="button"
              onClick={fetchScore}
              className="rounded-xl border border-amber-200/50 bg-amber-400/80 px-5 py-3 text-sm font-semibold text-slate-950 shadow hover:bg-amber-300/90 md:w-auto"
            >
              夕景スコアを取得
            </button>
            <button
              type="submit"
              disabled={loading}
              className="rounded-xl border border-white/10 bg-blue-500/70 px-5 py-3 text-sm font-semibold text-white shadow hover:bg-blue-500/90 disabled:cursor-not-allowed disabled:opacity-60 md:w-auto"
            >
              {loading ? "生成中..." : "カードを生成"}
            </button>
          </div>

          {error && <p className="rounded-lg bg-rose-500/20 px-4 py-2 text-sm text-rose-100">{error}</p>}
          {imageUrl && (
            <a
              href={imageUrl}
              target="_blank"
              rel="noreferrer"
              className="block text-sm text-amber-200 underline"
            >
              生成されたカードを開く
            </a>
          )}
        </form>
      </section>

      <aside className="flex-1 rounded-3xl bg-white/10 p-1">
        <div
          className={`h-full w-full rounded-3xl bg-gradient-to-br ${previewGradient} p-8 shadow-2xl transition`}
        >
          <div className="flex h-full flex-col justify-between rounded-3xl border border-white/20 bg-black/10 p-6">
            <div>
              <p className="text-sm uppercase tracking-widest text-white/80">Sunset Forecast</p>
              <h2 className="mt-4 text-4xl font-light">{spot || "宍道湖・夕日スポット"}</h2>
              <p className="mt-3 text-lg font-semibold">スコア {score}</p>
            </div>
            <div className="text-right text-sm">
              <p>{time}</p>
              <p className="text-xs opacity-80">{CARD_STYLES[cardStyle].label}</p>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
