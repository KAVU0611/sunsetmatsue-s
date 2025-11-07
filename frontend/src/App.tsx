import { useMemo, useState } from "react";
import { CalendarDays, CloudSun, ImageDown, MapPin } from "lucide-react";

import { Alert } from "./components/ui/alert";
import { Button } from "./components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "./components/ui/card";
import { Input } from "./components/ui/input";
import { Label } from "./components/ui/label";
import { Spinner } from "./components/ui/spinner";
import { Textarea } from "./components/ui/textarea";

interface CardResult {
  requestId: string;
  imageUrl: string;
  location: string;
  date: string;
  conditions: string;
  style: string;
  score: string;
  sunsetTime: string;
  generatedAt: string;
}

const initialDate = new Date().toISOString().split("T")[0];

export default function App() {
  const [form, setForm] = useState({
    location: "松江市 宍道湖",
    date: initialDate,
    conditions: "晴れ時々くもり",
    style: "minimal sunset poster",
    score: "85",
    sunsetTime: "17:15",
    prompt: ""
  });
  const [cards, setCards] = useState<CardResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const apiUrl = useMemo(() => import.meta.env.VITE_API_URL?.trim(), []);

  const handleChange = (field: string) => (value: string) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!apiUrl) {
      setError("VITE_API_URL が設定されていません。frontend/.env を確認してください。");
      return;
    }
    setLoading(true);
    setError(null);

    try {
      const payload = {
        location: form.location,
        date: form.date,
        conditions: form.conditions,
        style: form.style,
        score: form.score,
        sunsetTime: form.sunsetTime,
        prompt: form.prompt?.trim() || undefined
      };

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.message ?? "API呼び出しに失敗しました");
      }

      const imageUrl: string | undefined = data.cloudFrontUrl ?? data.s3Url;
      if (!imageUrl) {
        throw new Error("APIから画像URLが返却されませんでした");
      }

      const nextCard: CardResult = {
        requestId: data.requestId,
        imageUrl,
        location: form.location,
        date: form.date,
        conditions: form.conditions,
        style: form.style,
        score: form.score,
        sunsetTime: form.sunsetTime,
        generatedAt: new Date().toISOString()
      };

      setCards((prev) => [nextCard, ...prev].slice(0, 6));
    } catch (err) {
      const message = err instanceof Error ? err.message : "不明なエラーが発生しました";
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="mx-auto max-w-6xl space-y-10 px-4 py-10">
      <header className="space-y-4 text-center">
        <p className="text-sm uppercase tracking-[0.35em] text-foreground/50">Sunset Forecast Lab</p>
        <h1 className="text-4xl font-semibold leading-tight text-foreground">
          ベドロックで夕景カードを一発生成
        </h1>
        <p className="text-base text-foreground/70">
          日付・場所・天候を入力して画像を生成。API Gateway → Lambda → Bedrock → S3/CloudFront の流れをそのままUIで体験できます。
        </p>
      </header>

      <section className="rounded-[32px] bg-white/80 p-6 shadow-card">
        <form className="grid gap-6 md:grid-cols-2" onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <Label htmlFor="location" className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-foreground/60">
                <MapPin className="h-4 w-4" /> LOCATION
              </Label>
              <Input
                id="location"
                value={form.location}
                onChange={(event) => handleChange("location")(event.target.value)}
                placeholder="例: 宍道湖 サンセットスポット"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="date" className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-foreground/60">
                  <CalendarDays className="h-4 w-4" /> DATE
                </Label>
                <Input id="date" type="date" value={form.date} onChange={(event) => handleChange("date")(event.target.value)} />
              </div>
              <div>
                <Label htmlFor="sunsetTime" className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-foreground/60">
                  SUNSET
                </Label>
                <Input
                  id="sunsetTime"
                  type="time"
                  value={form.sunsetTime}
                  onChange={(event) => handleChange("sunsetTime")(event.target.value)}
                />
              </div>
            </div>
            <div>
              <Label htmlFor="conditions" className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-foreground/60">
                <CloudSun className="h-4 w-4" /> WEATHER
              </Label>
              <Input
                id="conditions"
                value={form.conditions}
                onChange={(event) => handleChange("conditions")(event.target.value)}
                placeholder="晴れ、うっすら雲、PM2.5少なめ etc"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="score" className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-foreground/60">
                  SCORE
                </Label>
                <Input
                  id="score"
                  type="number"
                  min={0}
                  max={100}
                  value={form.score}
                  onChange={(event) => handleChange("score")(event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="style" className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-foreground/60">
                  STYLE
                </Label>
                <Input id="style" value={form.style} onChange={(event) => handleChange("style")(event.target.value)} />
              </div>
            </div>
            <div>
              <Label htmlFor="prompt" className="flex items-center gap-2 text-xs uppercase tracking-[0.4em] text-foreground/60">
                CUSTOM PROMPT
              </Label>
              <Textarea
                id="prompt"
                value={form.prompt}
                onChange={(event) => handleChange("prompt")(event.target.value)}
                placeholder="任意: Titanへ渡す追加プロンプト"
              />
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-foreground/60">ベータ環境 / titan v1 / us-east-1</p>
              <Button type="submit" disabled={loading} className="min-w-[180px]">
                {loading ? (
                  <span className="flex items-center gap-2">
                    <Spinner />
                    生成中...
                  </span>
                ) : (
                  <span className="flex items-center gap-2">
                    <ImageDown className="h-4 w-4" />
                    画像を生成
                  </span>
                )}
              </Button>
            </div>
            {error && <Alert className="mt-2">{error}</Alert>}
          </div>

          <div className="space-y-4 rounded-[24px] bg-gradient-to-br from-[#fde68a] via-[#f97316] to-[#7c3aed] p-6 text-white">
            <p className="text-xs uppercase tracking-[0.5em] text-white/80">Preview</p>
            <h2 className="text-3xl font-semibold">Latest Cards</h2>
            <p className="text-sm text-white/80">生成ログと最新3件をリアルタイムで確認できます。</p>
            <div className="space-y-4 overflow-y-auto rounded-3xl bg-white/10 p-4 backdrop-blur">
              {cards.slice(0, 3).map((card) => (
                <div key={card.requestId + card.generatedAt} className="text-sm leading-snug text-white/90">
                  <p className="font-semibold text-white">{card.location}</p>
                  <p>
                    {card.date} / {card.conditions}
                  </p>
                  <p className="text-white/70">{card.style}</p>
                  <p className="text-white/80">req: {card.requestId}</p>
                </div>
              ))}
              {cards.length === 0 && <p className="text-sm text-white/80">まだ生成履歴がありません。</p>}
            </div>
          </div>
        </form>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-foreground/60">Gallery</p>
            <h2 className="text-2xl font-semibold">生成済みカード</h2>
          </div>
          <p className="text-xs text-foreground/60">CloudFront配信URLでレンダリング</p>
        </div>
        <div className="grid gap-6 md:grid-cols-2">
          {cards.length === 0 && (
            <Card className="p-6 text-center text-sm text-foreground/60">
              <p>まだカードがありません。左側のフォームから生成してください。</p>
            </Card>
          )}
          {cards.map((card) => (
            <Card key={card.requestId + card.generatedAt}>
              <div className="aspect-[3/4] overflow-hidden rounded-3xl">
                <img src={card.imageUrl} alt={`${card.location} sunset`} className="h-full w-full object-cover" />
              </div>
              <CardContent className="space-y-2">
                <CardTitle className="flex items-center justify-between text-base">
                  <span>{card.location}</span>
                  <span className="text-sm font-normal text-foreground/60">score {card.score}</span>
                </CardTitle>
                <CardDescription>
                  {card.date} / {card.conditions}
                </CardDescription>
                <p className="text-sm text-foreground/70">Style: {card.style}</p>
                <p className="text-[11px] text-foreground/50">Sunset {card.sunsetTime} · req {card.requestId}</p>
                <a
                  href={card.imageUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm text-accent underline"
                >
                  CloudFrontで開く
                </a>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>
    </main>
  );
}
