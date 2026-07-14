import http from "node:http";
import { readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const PORT = process.env.PORT || 3100;
// ponytail: model as env var so a newer Flash needs no code change.
// 기본값은 EOS되지 않는 별칭(항상 최신 Flash).
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";

// IP 기반 요청 제한 (메모리 저장, 서버 재시작 시 초기화)
const MIN_INTERVAL_MS = 2000; // IP당 최소 2초 간격
const MAX_REQUESTS_PER_HOUR = 20; // IP당 시간당 최대 20회
const ipRequestLog = new Map(); // { ip: { lastTime, times: [timestamps] } }

function getClientIP(req) {
  // X-Forwarded-For 헤더 체크 (프록시/로드밸런서 뒤에 있을 경우)
  const forwarded = req.headers["x-forwarded-for"];
  if (forwarded) return forwarded.split(",")[0].trim();
  return req.socket.remoteAddress || "unknown";
}

function checkRateLimit(ip) {
  const now = Date.now();
  const record = ipRequestLog.get(ip) || { lastTime: 0, times: [] };

  // 2초 최소 간격 확인
  if (now - record.lastTime < MIN_INTERVAL_MS) {
    return { allowed: false, reason: "too_fast", waitMs: MIN_INTERVAL_MS - (now - record.lastTime) };
  }

  // 1시간 내 요청 횟수 확인
  const oneHourAgo = now - 3600000;
  const recentRequests = record.times.filter(t => t > oneHourAgo);

  if (recentRequests.length >= MAX_REQUESTS_PER_HOUR) {
    return { allowed: false, reason: "quota_exceeded", resetIn: Math.ceil((Math.max(...recentRequests) + 3600000 - now) / 1000) };
  }

  return { allowed: true };
}

function recordRequest(ip) {
  const now = Date.now();
  const record = ipRequestLog.get(ip) || { lastTime: 0, times: [] };
  record.lastTime = now;
  record.times = record.times.filter(t => t > now - 3600000); // 1시간 이전 기록 제거
  record.times.push(now);
  ipRequestLog.set(ip, record);
}

// 구조화 출력 스키마(제약 디코딩) → 항상 유효한 JSON을 강제해 파싱 오류를 원천 차단.
const RESPONSE_SCHEMA = {
  type: "OBJECT",
  properties: {
    groups: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          title: { type: "STRING" },
          problems: {
            type: "ARRAY",
            items: {
              type: "OBJECT",
              properties: {
                number: { type: "INTEGER" },
                text: { type: "STRING" },
              },
              required: ["number", "text"],
              propertyOrdering: ["number", "text"],
            },
          },
        },
        required: ["title", "problems"],
        propertyOrdering: ["title", "problems"],
      },
    },
  },
  required: ["groups"],
  propertyOrdering: ["groups"],
};

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROBLEMS_DB = join(__dirname, "problems-db.json");
const log = (...a) => console.log(new Date().toISOString(), ...a);

// 문제 DB 관리
async function loadProblemsDB() {
  if (!existsSync(PROBLEMS_DB)) return {};
  try {
    const data = await readFile(PROBLEMS_DB, "utf8");
    return JSON.parse(data);
  } catch {
    return {};
  }
}

async function saveProblemsDB(db) {
  await writeFile(PROBLEMS_DB, JSON.stringify(db, null, 2), "utf8");
}

function extractGradeFromTitle(title) {
  const match = title.match(/(\d+)\s*급/);
  return match ? `${match[1]}급` : "기타";
}

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
  const generationConfig = {
    responseMimeType: "application/json",
    responseSchema: RESPONSE_SCHEMA,
    maxOutputTokens: 16384,
  };
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
  } catch (e) {
    const pos = Number(/position (\d+)/.exec(e.message)?.[1]) || 0;
    log(`❌ JSON 파싱 실패: ${e.message}`);
    log(`   길이=${text.length}, 파트수=${cand?.content?.parts?.length}`);
    if (pos) log(`   문제 지점: …${text.slice(Math.max(0, pos - 80), pos + 80)}…`);
    throw new Error(
      `Gemini가 올바른 JSON을 주지 않았습니다 (finishReason=${finish}). 다시 시도해 주세요.`
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
    if (req.method === "GET" && (req.url.startsWith("/examples/") || req.url.startsWith("/assets/"))) {
      const filePath = join(__dirname, req.url);
      if (!filePath.startsWith(__dirname)) {
        res.writeHead(403).end("forbidden");
        return;
      }
      try {
        const file = await readFile(filePath);
        const ext = filePath.split(".").pop().toLowerCase();
        const mimeTypes = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif" };
        const mime = mimeTypes[ext] || "application/octet-stream";
        res.writeHead(200, { "content-type": mime }).end(file);
      } catch {
        res.writeHead(404).end("not found");
      }
      return;
    }
    if (req.method === "POST" && req.url === "/api/save-problems") {
      try {
        const body = await readBody(req);
        const { groups, grade } = JSON.parse(body);

        if (!groups || !Array.isArray(groups) || !grade) {
          log(`⚠️ 저장 요청 실패: groups=${groups}, grade=${grade}`);
          res.writeHead(400, { "content-type": "application/json" }).end(
            JSON.stringify({ error: "groups(배열)와 grade(문자열)가 필요합니다." })
          );
          return;
        }

        const db = await loadProblemsDB();
        if (!db[grade]) db[grade] = [];

        let added = 0;
        groups.forEach((g) => {
          if (!db[grade].some((item) => item.title === g.title)) {
            db[grade].push(g);
            added++;
          }
        });

        await saveProblemsDB(db);
        log(`✓ 문제 저장: ${grade} (${added}세트 추가, 총 ${db[grade].length}세트)`);
        res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ success: true, added }));
      } catch (err) {
        log(`❌ 저장 오류: ${err.message}`);
        res.writeHead(400, { "content-type": "application/json" }).end(
          JSON.stringify({ error: err.message })
        );
      }
      return;
    }
    if (req.method === "POST" && req.url === "/api/extract") {
      const ip = getClientIP(req);
      const rateCheck = checkRateLimit(ip);

      if (!rateCheck.allowed) {
        const statusCode = rateCheck.reason === "too_fast" ? 429 : 429;
        const errorMsg = rateCheck.reason === "too_fast"
          ? `요청이 너무 빠릅니다. ${Math.ceil(rateCheck.waitMs / 1000)}초 후 다시 시도하세요.`
          : `시간당 요청 제한 도달. ${rateCheck.resetIn}초 후 초기화됩니다.`;
        log(`⚠️ Rate limit blocked for ${ip}: ${rateCheck.reason}`);
        res.writeHead(statusCode, { "content-type": "application/json" }).end(JSON.stringify({ error: errorMsg }));
        return;
      }

      const { image, mediaType } = JSON.parse(await readBody(req));
      log(`/api/extract 수신 (${ip}): 이미지 ${Math.round((image?.length || 0) / 1024)}KB(base64), type=${mediaType || "image/jpeg"}`);
      const groups = await extract(image, mediaType || "image/jpeg");
      recordRequest(ip);

      // 문제 데이터 반환 (클라이언트가 학년 선택 후 저장하도록)
      // 급수 추출 정보 포함
      const groupsWithGrade = groups.map((g) => ({
        ...g,
        detectedGrade: extractGradeFromTitle(g.title),
      }));

      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ groups: groupsWithGrade }));
      return;
    }
    if (req.method === "GET" && req.url.startsWith("/api/problems")) {
      const url = new URL(req.url, `http://${req.headers.host}`);
      const grade = url.searchParams.get("grade");
      const count = parseInt(url.searchParams.get("count") || "10", 10);

      const db = await loadProblemsDB();
      const problemGroups = db[grade] || [];

      if (problemGroups.length === 0) {
        res.writeHead(404, { "content-type": "application/json" }).end(
          JSON.stringify({ error: `"${grade}" 문제를 찾을 수 없습니다.` })
        );
        return;
      }

      // 랜덤하게 세트 선택 (복합 문제: 여러 세트에서 문제 추출)
      const allProblems = [];
      problemGroups.forEach((g) => {
        allProblems.push(...g.problems.map((p) => ({ ...p, groupTitle: g.title })));
      });

      // 순서 무작위로 섞기 (Fisher-Yates)
      for (let i = allProblems.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [allProblems[i], allProblems[j]] = [allProblems[j], allProblems[i]];
      }

      const selected = allProblems.slice(0, count);
      const generatedGroup = {
        title: `${grade} · 랜덤 ${selected.length}문제`,
        problems: selected.map((p, i) => ({ number: i + 1, text: p.text })),
      };

      log(`문제 생성: ${grade} ${selected.length}문제 (출처 ${new Set(selected.map(p => p.groupTitle)).size}개 세트)`);
      res.writeHead(200, { "content-type": "application/json" }).end(
        JSON.stringify({ groups: [generatedGroup] })
      );
      return;
    }
    if (req.method === "GET" && req.url === "/api/grades") {
      const db = await loadProblemsDB();
      const grades = Object.keys(db).sort();
      const stats = grades.map((g) => ({
        grade: g,
        sets: db[g].length,
        problems: db[g].reduce((n, set) => n + set.problems.length, 0),
      }));
      res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ grades: stats }));
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
