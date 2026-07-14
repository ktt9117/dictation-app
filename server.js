import http from "node:http";
import { readFile } from "node:fs/promises";

const PORT = process.env.PORT || 3000;
// ponytail: model as env var so a newer Flash needs no code change.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash";

const log = (...a) => console.log(new Date().toISOString(), ...a);

// ponytail: pass-through + shape guard. The vision model does the OCR, grouping
// (by 급수/단원) and ordering; we only normalize numbering and drop empties.
// A flat sheet with no groups comes back as a single group — same shape.
export function normalizeGroups(data) {
  if (!data || !Array.isArray(data.groups)) throw new Error("bad shape");
  return data.groups
    .map((g, gi) => ({
      title: String(g.title ?? "").trim() || String(gi + 1),
      problems: (Array.isArray(g.problems) ? g.problems : [])
        .map((p, i) => ({ number: Number(p.number) || i + 1, text: String(p.text ?? "").trim() }))
        .filter((p) => p.text.length > 0),
    }))
    .filter((g) => g.problems.length > 0);
}

const PROMPT =
  "이 사진은 한국 초등학생의 받아쓰기 급수표입니다. 여러 개의 급수(예: 1급, 2급 …) 또는 " +
  "단원이 여러 칸/열에 나뉘어 있을 수 있습니다. 각 급수(그룹)마다 제목과 그 안의 번호가 " +
  "매겨진 문장(보통 1~10번)을 순서대로 추출하세요.\n" +
  "- 각 그룹 title에는 급수 라벨과 단원 제목을 함께 넣으세요. 예: '1급 · 1. 시를 즐겨요'.\n" +
  "- 문장이 받아쓰기 격자에 넓게 띄어 적혀 있어도 실제 한국어 맞춤법·띄어쓰기로 정리하세요. " +
  "예: '왜  안  부르지  ?' → '왜 안 부르지?'\n" +
  "- 그룹은 급수 순서(1급→2급→…)대로 정렬하세요.\n" +
  "- 문제 문장만 추출하고 맨 위 제목·이름란·안내문은 제외하세요.\n\n" +
  "반드시 아래 JSON 형식으로만 응답하세요(설명 문장 없이 JSON만):\n" +
  '{"groups":[{"title":"급수/단원 제목","problems":[{"number":1,"text":"문장"}]}]}';

export async function extract(base64, mediaType) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY 환경변수가 설정되지 않았습니다.");
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
  const generationConfig = { responseMimeType: "application/json", maxOutputTokens: 16384 };
  // OCR엔 추론 불필요 → 2.5 Flash는 thinking을 끄면 훨씬 빠르다. (3.x는 0을 거부하므로 건너뜀)
  if (GEMINI_MODEL.includes("2.5")) generationConfig.thinkingConfig = { thinkingBudget: 0 };
  log(`Gemini 호출 중… (model=${GEMINI_MODEL})`);
  const t0 = Date.now();
  const r = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": key },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { inline_data: { mime_type: mediaType, data: base64 } },
            { text: PROMPT },
          ],
        },
      ],
      generationConfig,
    }),
  });
  const data = await r.json();
  log(`Gemini 응답 ${r.status} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  if (!r.ok) throw new Error(data?.error?.message || `Gemini ${r.status}`);

  const cand = data?.candidates?.[0];
  const finish = cand?.finishReason;
  // thinking(사고) 파트는 제외하고 실제 답변 텍스트만 이어붙인다.
  const text = (cand?.content?.parts ?? [])
    .filter((p) => !p.thought && typeof p.text === "string")
    .map((p) => p.text)
    .join("")
    .trim();
  if (!text) throw new Error(`Gemini 응답에 텍스트가 없습니다 (finishReason=${finish ?? "?"}, 차단되었을 수 있음).`);
  if (finish && finish !== "STOP") log(`⚠️ finishReason=${finish} — 응답이 잘렸을 수 있음`);

  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    log("❌ JSON 파싱 실패. 원문 앞부분:", text.slice(0, 200));
    throw new Error(
      `Gemini가 올바른 JSON을 주지 않았습니다 (finishReason=${finish}). ` +
        `다시 시도하거나 GEMINI_MODEL=gemini-3.5-flash 로 실행해 보세요.`
    );
  }
  const groups = normalizeGroups(parsed);
  log(`추출 완료: ${groups.length}개 그룹, 총 ${groups.reduce((n, g) => n + g.problems.length, 0)}문제`);
  return groups;
}

function readBody(req, limit = 20 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on("data", (c) => {
      size += c.length;
      if (size > limit) reject(new Error("payload too large"));
      else chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && (req.url === "/" || req.url === "/index.html")) {
      const html = await readFile(new URL("./index.html", import.meta.url));
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" }).end(html);
      return;
    }
    if (req.method === "GET" && req.url === "/manifest.json") {
      const m = await readFile(new URL("./manifest.json", import.meta.url));
      res.writeHead(200, { "content-type": "application/manifest+json" }).end(m);
      return;
    }
    if (req.method === "POST" && req.url === "/api/extract") {
      const { image, mediaType } = JSON.parse(await readBody(req));
      log(`/api/extract 수신: 이미지 ${Math.round((image?.length || 0) / 1024)}KB(base64), type=${mediaType || "image/jpeg"}`);
      const groups = await extract(image, mediaType || "image/jpeg");
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ groups }));
      return;
    }
    res.writeHead(404).end("not found");
  } catch (err) {
    console.error(err);
    res.writeHead(500, { "content-type": "application/json" }).end(
      JSON.stringify({ error: err.message || "server error" })
    );
  }
});

if (process.argv.includes("--selftest")) {
  const g = normalizeGroups({ groups: [
    { title: " 1급 · 시를 즐겨요 ", problems: [
      { number: 1, text: "  왜 안 부르지?  " },
      { number: 2, text: "" },          // dropped (empty)
      { text: "참 좋겠다." },            // number defaulted from index
    ]},
    { title: "빈 그룹", problems: [] },   // dropped (no problems)
  ]});
  console.assert(g.length === 1, "empty groups dropped");
  console.assert(g[0].title === "1급 · 시를 즐겨요", "title trimmed");
  console.assert(g[0].problems.length === 2, "empty rows dropped");
  console.assert(g[0].problems[0].text === "왜 안 부르지?", "text trimmed");
  console.assert(g[0].problems[1].number === 3, "number defaults to index+1");
  let threw = false;
  try { normalizeGroups({}); } catch { threw = true; }
  console.assert(threw, "bad shape throws");
  console.log("selftest ok");
} else {
  server.listen(PORT, () => console.log(`http://localhost:${PORT}`));
}
