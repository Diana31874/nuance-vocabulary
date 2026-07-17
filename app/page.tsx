"use client";

import {
  FormEvent,
  KeyboardEvent,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type Relation = "similar" | "related" | "opposite";
type WordNode = {
  word: string;
  relation: Relation;
  x: number;
  y: number;
  label?: string;
  shape?: "organic";
};
type Connector = {
  word: string;
  left: number;
  top: number;
  length: number;
  angle: number;
  label?: string;
};
type ComparisonData = {
  verdict: string;
  tags: string[];
  sections: { title: string; content: string }[];
  evidence_note?: string;
};
type PairComparison = ComparisonData & {
  base: string;
  target: string;
};
type AiSense = {
  id: string;
  definition: string;
  is_likely: boolean;
  nodes: Array<{ word: string; relation: Relation; label: string }>;
};
type ChooseRecommendation = {
  effect: string;
  word: string;
  explanation: string;
  preview: string;
};

const nodePositions = [
  [38, 12], [70, 20], [82, 46], [72, 76],
  [48, 89], [23, 73], [17, 42], [25, 24],
] as const;

async function requestAi<T>(action: string, payload: Record<string, unknown>): Promise<T> {
  const response = await fetch("/api/ai", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, payload }),
  });
  const result = await response.json() as { data?: T; error?: string };
  if (!response.ok || !result.data) throw new Error(result.error ?? "AI request failed.");
  return result.data;
}

const wordSets: Record<string, { sense: string; nodes: WordNode[] }> = {
  brave: {
    sense: "ready to face danger or difficulty",
    nodes: [
      { word: "courageous", relation: "similar", x: 38, y: 12 },
      { word: "valiant", relation: "similar", x: 70, y: 20, label: "more formal" },
      { word: "bold", relation: "related", x: 82, y: 46, label: "less cautious" },
      { word: "daring", relation: "related", x: 72, y: 76, label: "more adventurous" },
      { word: "fearless", relation: "similar", x: 48, y: 89 },
      { word: "reckless", relation: "related", x: 23, y: 73, label: "negative edge" },
      { word: "timid", relation: "opposite", x: 17, y: 42, shape: "organic" },
    ],
  },
  precise: {
    sense: "exact, accurate, and carefully expressed",
    nodes: [
      { word: "exact", relation: "similar", x: 38, y: 12 },
      { word: "meticulous", relation: "related", x: 70, y: 20, label: "about care" },
      { word: "rigorous", relation: "related", x: 82, y: 46, label: "more academic" },
      { word: "specific", relation: "similar", x: 72, y: 76 },
      { word: "accurate", relation: "similar", x: 48, y: 89 },
      { word: "pedantic", relation: "related", x: 23, y: 73, label: "negative edge" },
      { word: "vague", relation: "opposite", x: 17, y: 42, shape: "organic" },
    ],
  },
};

const comparisons: Record<string, {
  verdict: string;
  tags: string[];
  sections: { title: string; content: string }[];
}> = {
  valiant: {
    verdict:
      "Brave is broad and everyday. Valiant feels elevated and praises courage shown in a difficult struggle.",
    tags: ["valiant · more formal", "valiant · strongly approving", "brave · versatile"],
    sections: [
      { title: "Core difference in meaning", content: "Brave describes a willingness to face fear generally; valiant emphasizes admirable, often sustained courage in a struggle." },
      { title: "Formality & emotional tone", content: "Valiant is more literary and celebratory. Brave can sound warm, neutral, or quietly admiring." },
      { title: "Typical situations", content: "Use brave broadly for people, choices, and attempts. Valiant often appears with battles, efforts, resistance, and defeat." },
      { title: "Common collocations", content: "brave decision · brave face · valiant effort · valiant defense · valiant struggle" },
      { title: "Substitution test", content: "A brave effort is natural and neutral. A valiant effort adds praise and often suggests the effort continued despite poor odds." },
      { title: "Examples & misuse", content: "Natural: “The team made a valiant attempt to recover.” Awkward unless humorous: “She chose a valiant haircut.”" },
    ],
  },
  reckless: {
    verdict:
      "Brave praises courage despite risk. Reckless criticizes someone for ignoring risk or consequences.",
    tags: ["reckless · disapproving", "brave · approving", "both involve risk"],
    sections: [
      { title: "Core difference in meaning", content: "Bravery involves awareness of danger and a worthwhile reason to face it. Recklessness suggests poor judgment." },
      { title: "Formality & emotional tone", content: "Both are common across registers, but reckless is clearly critical." },
      { title: "Typical situations", content: "Brave decisions protect values or people; reckless decisions expose people or resources to needless danger." },
      { title: "Common collocations", content: "brave choice · brave witness · reckless driving · reckless disregard" },
      { title: "Substitution test", content: "“A brave intervention” praises the action. “A reckless intervention” questions whether it should have happened." },
      { title: "Examples & misuse", content: "Natural: “The report criticized the company’s reckless expansion.” Avoid reckless when you intend sincere praise." },
    ],
  },
};

const fallbackComparison = (base: string, word: string) => ({
  verdict: `${base[0].toUpperCase() + base.slice(1)} and ${word} overlap in this sense, but they differ in context, register, or emotional force. Select a section below for a closer comparison.`,
  tags: [`${word} · context-dependent`, `${base} · current sense`, "comparison preview"],
  sections: [
    { title: "Core difference in meaning", content: `${word} expresses a more specific shade of the current meaning of ${base}. Generate the live comparison to see the precise distinction.` },
    { title: "Formality & emotional tone", content: "The best choice depends on the speaker’s level of praise, intensity, and intended register." },
    { title: "Typical situations", content: "Check the surrounding noun and the purpose of the sentence before substituting either word." },
    { title: "Common collocations", content: `Explore frequent combinations with ${word} before using it in unfamiliar contexts.` },
    { title: "Substitution test", content: `Replacing ${base} with ${word} may change the sentence’s precision, register, or emotional force.` },
    { title: "Examples & misuse", content: "The full analysis flags combinations that are grammatical but unnatural to fluent speakers." },
  ],
});

const practiceQuestions = [
  {
    sentence: "Despite knowing that defeat was likely, the small unit mounted a _____ defense.",
    answers: ["brave", "valiant", "bold", "reckless"],
    correct: "valiant",
    explanation: "Valiant is best because it praises sustained courage in a difficult, possibly losing struggle.",
  },
  {
    sentence: "The paper offers a _____ definition of institutional trust.",
    answers: ["precise", "meticulous", "strict", "narrow"],
    correct: "precise",
    explanation: "Precise emphasizes exact and carefully expressed meaning, which fits an academic definition.",
  },
];

const dailyWords = [
  { word: "resolute", distinction: "Firmly decided and unlikely to change, especially when a situation tests your commitment.", nodes: ["determined", "steadfast", "unwavering", "tenacious", "stubborn", "inflexible", "hesitant"] },
  { word: "incisive", distinction: "Clear, direct, and intellectually sharp—often used for analysis, questions, or criticism.", nodes: ["perceptive", "acute", "penetrating", "trenchant", "sharp", "cutting", "vague"] },
  { word: "judicious", distinction: "Showing balanced, careful judgment rather than simply being intelligent or cautious.", nodes: ["wise", "prudent", "discerning", "sensible", "measured", "cautious", "rash"] },
  { word: "lucid", distinction: "Expressed with such clarity that a difficult idea becomes easy to understand.", nodes: ["clear", "coherent", "intelligible", "perspicuous", "vivid", "simple", "obscure"] },
  { word: "tenuous", distinction: "Weak, slight, or poorly supported—especially a connection, claim, or relationship.", nodes: ["weak", "fragile", "slight", "remote", "speculative", "uncertain", "robust"] },
  { word: "nuanced", distinction: "Sensitive to subtle differences instead of reducing something to a simple opposition.", nodes: ["subtle", "refined", "qualified", "layered", "complex", "delicate", "simplistic"] },
  { word: "cogent", distinction: "Logically convincing because the reasoning is clear, relevant, and well organized.", nodes: ["convincing", "compelling", "persuasive", "sound", "forceful", "plausible", "flimsy"] },
  { word: "equivocal", distinction: "Deliberately or inherently open to more than one interpretation; not unequivocal.", nodes: ["ambiguous", "unclear", "evasive", "qualified", "noncommittal", "vague", "unequivocal"] },
  { word: "salient", distinction: "Most noticeable or important within a particular discussion, argument, or set of facts.", nodes: ["prominent", "striking", "notable", "relevant", "important", "conspicuous", "peripheral"] },
  { word: "scrupulous", distinction: "Extremely careful to be accurate, ethical, or attentive to every relevant detail.", nodes: ["meticulous", "conscientious", "principled", "thorough", "exact", "fastidious", "careless"] },
  { word: "tentative", distinction: "Presented provisionally because certainty or commitment is not yet justified.", nodes: ["provisional", "cautious", "hesitant", "preliminary", "uncertain", "qualified", "definitive"] },
  { word: "trenchant", distinction: "Expressed sharply and effectively, often with forceful criticism or analysis.", nodes: ["incisive", "pungent", "forceful", "penetrating", "cutting", "blunt", "bland"] },
];

function getDailyWord() {
  const now = new Date();
  const utcDay = Math.floor(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 86400000);
  return dailyWords[utcDay % dailyWords.length];
}

function ellipsoidBoundary(
  centerX: number,
  centerY: number,
  targetX: number,
  targetY: number,
  radiusX: number,
  radiusY: number,
) {
  const dx = targetX - centerX;
  const dy = targetY - centerY;
  const scale = 1 / Math.sqrt((dx * dx) / (radiusX * radiusX) + (dy * dy) / (radiusY * radiusY));
  return { x: centerX + dx * scale, y: centerY + dy * scale };
}

export default function Home() {
  const [active, setActive] = useState("Explore");
  const [query, setQuery] = useState("brave");
  const [centerWord, setCenterWord] = useState("brave");
  const [selected, setSelected] = useState("valiant");
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [walkthrough, setWalkthrough] = useState(true);
  const [accountOpen, setAccountOpen] = useState(false);
  const [userDataReady, setUserDataReady] = useState(false);
  const [senseOpen, setSenseOpen] = useState(false);
  const [saved, setSaved] = useState(["continual · continuous", "assure · ensure · insure"]);
  const [familiar, setFamiliar] = useState<string[]>([]);
  const [newWords, setNewWords] = useState(["valiant", "meticulous"]);
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [chooseText, setChooseText] = useState("The results ___ the importance of early intervention.");
  const [aiSenses, setAiSenses] = useState<AiSense[]>([]);
  const [activeSenseIndex, setActiveSenseIndex] = useState(0);
  const [aiComparison, setAiComparison] = useState<PairComparison | null>(null);
  const [chooseResults, setChooseResults] = useState<ChooseRecommendation[]>([]);
  const [chooseUncertainty, setChooseUncertainty] = useState("");
  const [inferredIntent, setInferredIntent] = useState("Academic · precise");
  const [rewrite, setRewrite] = useState("");
  const [loading, setLoading] = useState<"" | "explore" | "compare" | "choose" | "rewrite" | "practice">("");
  const [practiceIndex, setPracticeIndex] = useState(0);
  const [practiceAnswer, setPracticeAnswer] = useState("");
  const [aiPractice, setAiPractice] = useState<(typeof practiceQuestions)[number] & { alternatives?: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const gardenRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLButtonElement>(null);
  const nodeRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const comparisonRequestRef = useRef(0);

  useEffect(() => {
    const stored = window.localStorage.getItem("nuance-theme");
    if (stored === "dark" || stored === "light") setTheme(stored);
    else setTheme(window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const learning = window.localStorage.getItem("nuance-learning");
    if (learning) {
      try {
        const parsed = JSON.parse(learning);
        if (Array.isArray(parsed.saved)) setSaved(parsed.saved);
        if (Array.isArray(parsed.familiar)) setFamiliar(parsed.familiar);
        if (Array.isArray(parsed.newWords)) setNewWords(parsed.newWords);
      } catch {
        window.localStorage.removeItem("nuance-learning");
      }
    }
    setUserDataReady(true);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem("nuance-theme", theme);
  }, [theme]);

  useEffect(() => {
    if (!userDataReady) return;
    window.localStorage.setItem("nuance-learning", JSON.stringify({ saved, familiar, newWords }));
  }, [saved, familiar, newWords, userDataReady]);

  const aiSet = useMemo(() => {
    const sense = aiSenses[activeSenseIndex];
    if (!sense) return null;
    return {
      sense: sense.definition,
      nodes: sense.nodes.map((node, index): WordNode => ({
        ...node,
        x: nodePositions[index]?.[0] ?? 50,
        y: nodePositions[index]?.[1] ?? 50,
        shape: node.relation === "opposite" ? "organic" : undefined,
      })),
    };
  }, [aiSenses, activeSenseIndex]);
  const set = aiSet ?? wordSets[centerWord] ?? wordSets.brave;

  useLayoutEffect(() => {
    const update = () => {
      const garden = gardenRef.current;
      const center = centerRef.current;
      if (!garden || !center) return;
      const gardenBox = garden.getBoundingClientRect();
      const centerBox = center.getBoundingClientRect();
      const cx = centerBox.left - gardenBox.left + centerBox.width / 2;
      const cy = centerBox.top - gardenBox.top + centerBox.height / 2;
      const next = set.nodes.flatMap((node) => {
        const element = nodeRefs.current[node.word];
        if (!element) return [];
        const box = element.getBoundingClientRect();
        const tx = box.left - gardenBox.left + box.width / 2;
        const ty = box.top - gardenBox.top + box.height / 2;
        const start = ellipsoidBoundary(cx, cy, tx, ty, centerBox.width / 2, centerBox.height / 2);
        const end = ellipsoidBoundary(tx, ty, cx, cy, box.width / 2, box.height / 2);
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        return [{
          word: node.word,
          left: start.x,
          top: start.y,
          length: Math.sqrt(dx * dx + dy * dy),
          angle: Math.atan2(dy, dx) * 180 / Math.PI,
          label: node.label,
        }];
      });
      setConnectors(next);
    };
    const frame = requestAnimationFrame(update);
    const observer = new ResizeObserver(update);
    if (gardenRef.current) observer.observe(gardenRef.current);
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", update);
    };
  }, [set]);

  const currentAiComparison = aiComparison?.base === centerWord && aiComparison.target === selected ? aiComparison : null;
  const comparison = currentAiComparison
    ?? (centerWord === "brave" ? comparisons[selected] : undefined)
    ?? fallbackComparison(centerWord, selected);
  const practice = aiPractice ?? practiceQuestions[practiceIndex % practiceQuestions.length];
  const dailyWord = useMemo(getDailyWord, []);

  const exploreWord = async (input: string) => {
    const normalized = input.trim().toLowerCase();
    if (!normalized) return;
    setLoading("explore");
    comparisonRequestRef.current += 1;
    setFeedback("");
    try {
      const data = await requestAi<{ word: string; part_of_speech: string; senses: AiSense[] }>("explore", { query: normalized });
      const likelyIndex = Math.max(0, data.senses.findIndex((sense) => sense.is_likely));
      setCenterWord(data.word);
      setQuery(data.word);
      setAiSenses(data.senses);
      setActiveSenseIndex(likelyIndex);
      setSelected(data.senses[likelyIndex]?.nodes[0]?.word ?? "");
      setAiComparison(null);
      setSenseOpen(data.senses.length > 1);
    } catch (error) {
      if (wordSets[normalized]) {
        setCenterWord(normalized);
        setAiSenses([]);
        setSelected(wordSets[normalized].nodes[1].word);
      }
      setFeedback(error instanceof Error ? error.message : "Could not explore that word.");
    } finally {
      setLoading("");
    }
  };

  const submitSearch = async (event: FormEvent) => {
    event.preventDefault();
    await exploreWord(query);
  };

  const keyboardSearch = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") submitSearch(event as unknown as FormEvent);
  };

  const selectNode = async (word: string) => {
    const base = centerWord;
    const sense = set.sense;
    const requestId = comparisonRequestRef.current + 1;
    comparisonRequestRef.current = requestId;
    setSelected(word);
    setAiComparison(null);
    setLoading("compare");
    try {
      const data = await requestAi<ComparisonData>("compare", { base, target: word, sense });
      if (comparisonRequestRef.current === requestId) {
        setAiComparison({ ...data, base, target: word });
      }
    } catch (error) {
      if (comparisonRequestRef.current === requestId) {
        setFeedback(error instanceof Error ? error.message : "Could not compare those words.");
      }
    } finally {
      if (comparisonRequestRef.current === requestId) setLoading("");
    }
  };

  const openDailyWord = () => {
    comparisonRequestRef.current += 1;
    const nodes = dailyWord.nodes.map((word, index) => ({
      word,
      relation: (index < 3 ? "similar" : index === dailyWord.nodes.length - 1 ? "opposite" : "related") as Relation,
      label: "",
    }));
    setQuery(dailyWord.word);
    setCenterWord(dailyWord.word);
    setAiSenses([{
      id: `daily-${dailyWord.word}`,
      definition: dailyWord.distinction,
      is_likely: true,
      nodes,
    }]);
    setActiveSenseIndex(0);
    setSelected(nodes[0]?.word ?? "");
    setAiComparison(null);
    setSenseOpen(false);
    setFeedback("Today’s preview and full map now use the same words.");
  };

  const analyzeChoice = async () => {
    setLoading("choose");
    setRewrite("");
    try {
      const data = await requestAi<{
        inferred_intent: string;
        recommendations: ChooseRecommendation[];
        uncertainty: string;
      }>("choose", { text: chooseText });
      setInferredIntent(data.inferred_intent);
      setChooseResults(data.recommendations);
      setChooseUncertainty(data.uncertainty);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not analyze this writing.");
    } finally {
      setLoading("");
    }
  };

  const rewriteWriting = async () => {
    setLoading("rewrite");
    try {
      const data = await requestAi<{ rewrite: string; changes: string[] }>("rewrite", {
        text: chooseText,
        word: chooseResults[0]?.word ?? "",
      });
      setRewrite(`${data.rewrite}\n\n${data.changes.map((change) => `• ${change}`).join("\n")}`);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not rewrite this passage.");
    } finally {
      setLoading("");
    }
  };

  const generatePractice = async () => {
    setLoading("practice");
    try {
      const contrast = saved[practiceIndex % Math.max(saved.length, 1)] ?? `${centerWord} · ${selected}`;
      const data = await requestAi<{
        sentence: string;
        answers: string[];
        correct: string;
        explanation: string;
        alternatives: string;
      }>("practice", { contrast });
      setAiPractice(data);
      setPracticeAnswer("");
      setPracticeIndex((index) => index + 1);
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : "Could not generate a practice question.");
    } finally {
      setLoading("");
    }
  };

  const explainAnotherWay = async () => {
    const base = centerWord;
    const target = selected;
    const requestId = comparisonRequestRef.current + 1;
    comparisonRequestRef.current = requestId;
    setLoading("compare");
    try {
      const data = await requestAi<ComparisonData>("compare", {
        base,
        target,
        sense: `${set.sense}. Explain with a different framing and different examples.`,
      });
      if (comparisonRequestRef.current === requestId) {
        setAiComparison({ ...data, base, target });
      }
    } catch (error) {
      if (comparisonRequestRef.current === requestId) {
        setFeedback(error instanceof Error ? error.message : "Could not regenerate the explanation.");
      }
    } finally {
      if (comparisonRequestRef.current === requestId) setLoading("");
    }
  };

  const saveContrast = () => {
    const contrast = `${centerWord} · ${selected}`;
    if (!saved.includes(contrast)) setSaved((items) => [contrast, ...items]);
    setFeedback("Contrast saved and added to spaced repetition.");
  };

  const markWord = (status: "familiar" | "new") => {
    if (status === "familiar") {
      setFamiliar((items) => Array.from(new Set([selected, ...items])));
      setNewWords((items) => items.filter((item) => item !== selected));
      setFeedback(`${selected} marked familiar.`);
    } else {
      setNewWords((items) => Array.from(new Set([selected, ...items])));
      setFamiliar((items) => items.filter((item) => item !== selected));
      setFeedback(`${selected} marked new to you.`);
    }
  };

  return (
    <div className="app-shell">
      <header className="site-header">
        <button className="brand" onClick={() => setActive("Explore")} aria-label="Nuance home">
          <span className="brand-mark">n</span><span>Nuance</span>
        </button>
        <nav aria-label="Primary navigation">
          {["Explore", "Choose", "Practice", "Library"].map((item) => (
            <button key={item} className={active === item ? "active" : ""} onClick={() => setActive(item)}>
              {item}
            </button>
          ))}
        </nav>
        <div className="header-actions">
          <button className="icon-button" onClick={() => setTheme(theme === "light" ? "dark" : "light")} aria-label="Toggle color theme">
            {theme === "light" ? "☾" : "☀"}
          </button>
          <button className="avatar" aria-label="Account menu" onClick={() => setAccountOpen(true)}>EL</button>
        </div>
      </header>

      <main>
        {active === "Explore" && (
          <>
            <section className="intro">
              <div>
                <p className="eyebrow">Word garden</p>
                <h1>Explore the space <em>between</em> words.</h1>
              </div>
              <p>Begin with a familiar word, then follow its shades of meaning. Select a word to compare it without losing your place.</p>
            </section>

            <section className="daily-word" aria-labelledby="daily-word-title">
              <div className="daily-copy">
                <span className="daily-kicker">Word of the day · shared worldwide</span>
                <h2 id="daily-word-title">{dailyWord.word}</h2>
                <p>{dailyWord.distinction}</p>
                <button onClick={openDailyWord}>
                  Explore today’s map →
                </button>
              </div>
              <div className="daily-preview" aria-label={`A preview of words related to ${dailyWord.word}`}>
                <span className="daily-center">{dailyWord.word}</span>
                <div className="daily-nodes">
                  {dailyWord.nodes.map((word, index) => (
                    <span key={word} className={index < 3 ? "similar" : index === dailyWord.nodes.length - 1 ? "opposite" : "related"}>{word}</span>
                  ))}
                </div>
                <small>New shared map every day</small>
              </div>
            </section>

            <form className="search-box" onSubmit={submitSearch}>
              <span aria-hidden="true" className="search-icon" />
              <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={keyboardSearch} aria-label="Search for a word or describe an idea" />
              <span className="key-hint">⌘ K</span>
              <button type="submit" disabled={loading === "explore"}>{loading === "explore" ? "Growing map…" : "Explore word"}</button>
            </form>

            <section className="workspace">
              <div className="map-card">
                <div className="map-toolbar">
                  <div className="sense">
                    <span>Sense:</span>
                    <strong>{set.sense}</strong>
                    <button onClick={() => setSenseOpen(!senseOpen)}>Change ▾</button>
                    {senseOpen && (
                      <div className="sense-menu">
                        {(aiSenses.length ? aiSenses : [{ id: "current", definition: set.sense, is_likely: true, nodes: [] }]).map((sense, index) => (
                          <button
                            key={sense.id}
                            onClick={() => {
                              setActiveSenseIndex(index);
                              setSelected(sense.nodes[0]?.word ?? selected);
                              setAiComparison(null);
                              setSenseOpen(false);
                            }}
                          >
                            {sense.definition} {index === activeSenseIndex && <span>current</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="legend" aria-label="Map legend">
                    <span><i className="dot similar" />Similar</span>
                    <span><i className="dot related" />Related</span>
                    <span><i className="dot opposite" />Opposite</span>
                  </div>
                </div>

                <div className="garden" ref={gardenRef}>
                  <div className="orbit orbit-one" />
                  <div className="orbit orbit-two" />
                  <div className="connectors" aria-hidden="true">
                    {connectors.map((line) => (
                      <div
                        key={line.word}
                        className={`connector connector-${set.nodes.find((n) => n.word === line.word)?.relation}`}
                        style={{ left: line.left, top: line.top, width: line.length, transform: `rotate(${line.angle}deg)` }}
                      >
                        {line.label && (
                          <span className="edge-label" style={{ transform: `translate(-50%, -50%) rotate(${-line.angle}deg)` }}>
                            {line.label}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>

                  <button ref={centerRef} className="word-node center-node" style={{ left: "50%", top: "50%" }}>
                    {centerWord}<small>adjective</small>
                  </button>
                  {set.nodes.map((node) => (
                    <button
                      key={node.word}
                      ref={(element) => { nodeRefs.current[node.word] = element; }}
                      className={`word-node ${node.relation} ${node.shape === "organic" ? "organic" : ""} ${selected === node.word ? "selected" : ""}`}
                      style={{ left: `${node.x}%`, top: `${node.y}%` }}
                      onClick={() => selectNode(node.word)}
                      onDoubleClick={() => {
                        if (wordSets[node.word]) {
                          setCenterWord(node.word);
                          setQuery(node.word);
                        } else setFeedback(`Exploring outward from “${node.word}” will generate its own sense-aware map.`);
                      }}
                    >
                      {node.word}
                    </button>
                  ))}
                  <p className="map-hint"><span>i</span>Select a word to compare · double-click to explore from it</p>
                </div>
              </div>

              <aside className="comparison-panel">
                <div className="panel-head">
                  <div className="panel-kicker">Comparison <button aria-label="More comparison options">•••</button></div>
                  <div className="pair"><span>{centerWord}</span><i>and</i><strong>{selected}</strong></div>
                  <p>adjective · current senses shown</p>
                </div>
                <div className="verdict" aria-live="polite">
                  <span>Pair overview</span>
                  <p>{loading === "compare" ? `Reading how ${centerWord} differs from ${selected}…` : comparison.verdict}</p>
                </div>
                <div className="chips">{comparison.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <div className="detail-sections">
                  {loading === "compare" && <p className="ai-loading">Comparing nuance and usage…</p>}
                  {comparison.sections.map((section, index) => (
                    <details key={section.title} open={index === 0}>
                      <summary>{section.title}</summary>
                      <p>{section.content}</p>
                    </details>
                  ))}
                </div>
                <div className="source-row"><button>◉ Sources</button><span>{comparison.evidence_note ?? "Curated sample · live results use AI synthesis"}</span></div>
                <div className="quality-actions">
                  <button onClick={() => setFeedback("Thanks. This example has been marked for replacement.")}>This example sounds unnatural</button>
                  <button onClick={explainAnotherWay}>Explain another way</button>
                </div>
                <div className="word-status">
                  <p>These mark only <strong>{selected}</strong>. Use “Save contrast” below to save the pair.</p>
                  <div>
                    <button onClick={() => markWord("familiar")} aria-pressed={familiar.includes(selected)} className={familiar.includes(selected) ? "chosen" : ""}>Familiar: {selected}</button>
                    <button onClick={() => markWord("new")} aria-pressed={newWords.includes(selected)} className={newWords.includes(selected) ? "chosen" : ""}>New to me: {selected}</button>
                  </div>
                </div>
                <div className="panel-actions">
                  <button onClick={() => setFeedback(`A new map would open with “${selected}” at its center.`)}>Explore from {selected}</button>
                  <button className="primary" onClick={saveContrast}>{saved.includes(`${centerWord} · ${selected}`) ? "Saved ✓" : "Save contrast"}</button>
                </div>
              </aside>
            </section>
          </>
        )}

        {active === "Choose" && (
          <section className="feature-page choose-page">
            <p className="eyebrow">Contextual word choice</p>
            <h1>Choose the word that says <em>exactly</em> what you mean.</h1>
            <p className="page-lead">Mark your target with ___, brackets, selected text, or a natural-language instruction. Your writing disappears after analysis unless you save it.</p>
            <div className="choose-layout">
              <div className="input-card">
                <label htmlFor="writing">Sentence or paragraph</label>
                <textarea id="writing" value={chooseText} onChange={(event) => setChooseText(event.target.value)} />
                <div className="intent-row"><span>Inferred intent</span><button>{inferredIntent} ▾</button></div>
                <button className="analyze-button" onClick={analyzeChoice} disabled={loading === "choose"}>{loading === "choose" ? "Reading context…" : "Find the right word"}</button>
              </div>
              <div className="recommendations">
                {(chooseResults.length ? chooseResults.map((item) => [item.effect, item.word, item.explanation, item.preview]) : [
                  ["Most natural", "underscore", "Emphasizes the significance of the finding without claiming it proves the point."],
                  ["Strongest claim", "demonstrate", "Implies that the evidence establishes the importance more directly."],
                  ["Most cautious", "suggest", "Appropriate when the evidence is indicative rather than conclusive."],
                ]).map(([effect, word, explanation, preview], index) => (
                  <article key={word}>
                    <span className="rank">{index + 1}</span>
                    <div><small>{effect}</small><h2>{word}</h2><p>{explanation}</p><blockquote>{preview ?? <>The results <strong>{word}</strong> the importance of early intervention.</>}</blockquote></div>
                    <button onClick={() => setChooseText(preview ?? chooseText.replace("___", word))}>Use</button>
                  </article>
                ))}
                <button className="rewrite-button" onClick={rewriteWriting} disabled={loading === "rewrite"}>{loading === "rewrite" ? "Rewriting…" : "Optionally improve the full sentence"}</button>
                {rewrite && <pre className="rewrite-result">{rewrite}</pre>}
                <p className="uncertainty">{chooseUncertainty || "All three are grammatical; the best choice depends on how strongly the evidence supports the claim."}</p>
              </div>
            </div>
          </section>
        )}

        {active === "Practice" && (
          <section className="feature-page practice-page">
            <div className="practice-heading">
              <div><p className="eyebrow">Daily review · 1 of 5</p><h1>Which word fits <em>best?</em></h1></div>
              <button>Practice all saved contrasts</button>
            </div>
            <div className="practice-card">
              <span className="contrast-label">brave · valiant · bold · reckless</span>
              <p className="question">{practice.sentence}</p>
              <div className="answer-grid">
                {practice.answers.map((answer) => (
                  <button key={answer} className={practiceAnswer === answer ? "selected" : ""} onClick={() => setPracticeAnswer(answer)}>{answer}</button>
                ))}
              </div>
              {practiceAnswer && (
                <div className={`answer-feedback ${practiceAnswer === practice.correct ? "correct" : "incorrect"}`}>
                  <strong>{practiceAnswer === practice.correct ? "Exactly right." : `${practice.correct} is the better choice.`}</strong>
                  <p>{practice.explanation}</p>
                  <details><summary>Why the other choices are weaker</summary><p>They either sound too general, change the intended evaluation, or do not collocate as naturally with “defense.”</p></details>
                </div>
              )}
              <div className="practice-footer"><span>Mistakes return sooner in your review schedule.</span><button onClick={generatePractice} disabled={loading === "practice"}>{loading === "practice" ? "Creating question…" : "Next AI question →"}</button></div>
            </div>
          </section>
        )}

        {active === "Library" && (
          <section className="feature-page library-page">
            <p className="eyebrow">Your vocabulary</p>
            <h1>A library built around <em>distinctions.</em></h1>
            <div className="library-grid">
              <section><div className="library-title"><h2>Saved contrasts</h2><span>{saved.length}</span></div>{saved.map((item) => <button key={item}><strong>{item}</strong><span>Ready to practice →</span></button>)}</section>
              <section><div className="library-title"><h2>New to me</h2><span>{newWords.length}</span></div>{newWords.map((item) => <button key={item}><strong>{item}</strong><span>Explore word →</span></button>)}</section>
              <section><div className="library-title"><h2>Familiar</h2><span>{familiar.length}</span></div>{familiar.length ? familiar.map((item) => <button key={item}><strong>{item}</strong><span>Shown less often</span></button>) : <p className="empty">Words you mark familiar will appear here and be suggested less often.</p>}</section>
              <section><div className="library-title"><h2>Learning pattern</h2><span>7 days</span></div><div className="pattern"><strong>Formal vs everyday register</strong><p>Your recent mistakes suggest this is the distinction worth revisiting next.</p><button onClick={() => setActive("Practice")}>Start a focused review</button></div></section>
            </div>
          </section>
        )}
      </main>

      {walkthrough && (
        <div className="walkthrough" role="dialog" aria-modal="true" aria-label="Welcome walkthrough">
          <button className="skip" onClick={() => setWalkthrough(false)}>Skip</button>
          <span className="walkthrough-step">1 of 3</span>
          <h2>Start with a word you already know.</h2>
          <p>Nuance maps nearby meanings around it. Click <strong>valiant</strong> to see why it feels different from <strong>brave</strong>.</p>
          <button className="primary" onClick={() => setWalkthrough(false)}>Try the example</button>
        </div>
      )}

      {accountOpen && (
        <div className="account-modal" role="dialog" aria-modal="true" aria-label="Sign in to Nuance">
          <button className="close-modal" onClick={() => setAccountOpen(false)} aria-label="Close account dialog">×</button>
          <span className="walkthrough-step">Cross-device learning</span>
          <h2>Keep your word garden with you.</h2>
          <p>Sign in to sync saved contrasts, practice mistakes, and familiar words across devices.</p>
          <button className="google-button" onClick={() => setFeedback("Google sign-in will connect when the public authentication service is configured.")}>G&nbsp;&nbsp; Continue with Google</button>
          <div className="divider"><span>or use email</span></div>
          <label>Email address<input type="email" placeholder="you@example.com" /></label>
          <label>Password<input type="password" placeholder="At least 8 characters" /></label>
          <button className="primary account-submit" onClick={() => setFeedback("Email sign-in is ready for the authentication connection.")}>Create account</button>
          <small>For this prototype, learning choices are saved on this device.</small>
        </div>
      )}

      {feedback && <button className="toast" onClick={() => setFeedback("")}>{feedback}<span>×</span></button>}
    </div>
  );
}
