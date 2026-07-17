const OPENAI_API_URL = "https://api.openai.com/v1/responses";
const MODEL = process.env.OPENAI_MODEL ?? "gpt-5.4-mini";

type AiAction = "explore" | "compare" | "choose" | "rewrite" | "practice";

const baseInstructions = `You are the language engine for Nuance, an advanced English vocabulary product.
Write for a fluent, college-educated English speaker who wants precise academic and general-purpose vocabulary.
Be linguistically careful: distinguish denotation, register, connotation, collocation, and context.
Never invent dictionary quotations, corpus counts, or citations. Phrase non-absolute preferences honestly.
Use English only. Return only data matching the supplied JSON schema.`;

const schemas = {
  explore: {
    type: "object",
    additionalProperties: false,
    required: ["word", "part_of_speech", "senses"],
    properties: {
      word: { type: "string" },
      part_of_speech: { type: "string" },
      senses: {
        type: "array",
        minItems: 1,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["id", "definition", "is_likely", "nodes"],
          properties: {
            id: { type: "string" },
            definition: { type: "string" },
            is_likely: { type: "boolean" },
            nodes: {
              type: "array",
              minItems: 6,
              maxItems: 8,
              items: {
                type: "object",
                additionalProperties: false,
                required: ["word", "relation", "label"],
                properties: {
                  word: { type: "string" },
                  relation: { type: "string", enum: ["similar", "related", "opposite"] },
                  label: { type: "string" },
                },
              },
            },
          },
        },
      },
    },
  },
  compare: {
    type: "object",
    additionalProperties: false,
    required: ["verdict", "tags", "sections", "evidence_note"],
    properties: {
      verdict: { type: "string" },
      tags: { type: "array", minItems: 2, maxItems: 4, items: { type: "string" } },
      sections: {
        type: "array",
        minItems: 6,
        maxItems: 6,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "content"],
          properties: { title: { type: "string" }, content: { type: "string" } },
        },
      },
      evidence_note: { type: "string" },
    },
  },
  choose: {
    type: "object",
    additionalProperties: false,
    required: ["detected_target", "inferred_intent", "recommendations", "uncertainty"],
    properties: {
      detected_target: { type: "string" },
      inferred_intent: { type: "string" },
      recommendations: {
        type: "array",
        minItems: 3,
        maxItems: 5,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["effect", "word", "explanation", "preview"],
          properties: {
            effect: { type: "string" },
            word: { type: "string" },
            explanation: { type: "string" },
            preview: { type: "string" },
          },
        },
      },
      uncertainty: { type: "string" },
    },
  },
  rewrite: {
    type: "object",
    additionalProperties: false,
    required: ["rewrite", "changes"],
    properties: {
      rewrite: { type: "string" },
      changes: { type: "array", minItems: 1, maxItems: 5, items: { type: "string" } },
    },
  },
  practice: {
    type: "object",
    additionalProperties: false,
    required: ["sentence", "answers", "correct", "explanation", "alternatives"],
    properties: {
      sentence: { type: "string" },
      answers: { type: "array", minItems: 4, maxItems: 4, items: { type: "string" } },
      correct: { type: "string" },
      explanation: { type: "string" },
      alternatives: { type: "string" },
    },
  },
} as const;

function promptFor(action: AiAction, payload: Record<string, unknown>) {
  if (action === "explore") {
    return `Explore the English word or phrase ${JSON.stringify(payload.query)}.
${payload.context ? `Context supplied by the user: ${JSON.stringify(payload.context)}` : ""}
Identify distinct common senses. For each sense, provide a balanced 6–8-node map: mostly near-synonyms, useful context-specific or commonly confused alternatives, and at most one clear opposite.
Treat grammatical forms as one lexical entry. Labels must be short directional distinctions such as "more formal", "informal", "dated", "literary", "stronger", "more cautious", or an empty string.`;
  }
  if (action === "compare") {
    return `Compare ${JSON.stringify(payload.base)} with ${JSON.stringify(payload.target)} specifically in this sense: ${JSON.stringify(payload.sense)}.
Use exactly these six section titles in order: Core difference in meaning; Formality & emotional tone; Typical situations; Common collocations; Substitution test; Examples & misuse.
Include natural examples and explicitly identify awkward usage. The evidence note must say this is an AI synthesis and should be checked against linked dictionary/corpus evidence once that source layer is connected.`;
  }
  if (action === "choose") {
    return `Analyze this writing and recommend precise replacements for the marked target:
${JSON.stringify(payload.text)}
Target marking may use ___, [brackets], a stated replacement request, or an exact target supplied separately: ${JSON.stringify(payload.target ?? "")}.
Rank recommendations by intended effect, such as most natural, most academically precise, strongest claim, or most cautious. Preserve the full surrounding context in each sentence preview. Do not rewrite unrelated wording.`;
  }
  if (action === "rewrite") {
    return `Improve the full sentence or paragraph below for precise, natural academic English while preserving its meaning:
${JSON.stringify(payload.text)}
Preferred vocabulary choice, if supplied: ${JSON.stringify(payload.word ?? "")}.
Avoid inflated prose and explain the most important changes briefly.`;
  }
  return `Create one source-conscious vocabulary practice question for this saved contrast group: ${JSON.stringify(payload.contrast)}.
Use a natural sentence with exactly one blank written as _____. Provide exactly four closely related answer options. One must be the best answer, while the explanation should acknowledge if another is possible with a changed nuance.`;
}

async function callOpenAI(action: AiAction, payload: Record<string, unknown>) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured on the server.");
  }

  const response = await fetch(OPENAI_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: baseInstructions,
      input: promptFor(action, payload),
      reasoning: { effort: "low" },
      text: {
        format: {
          type: "json_schema",
          name: `nuance_${action}`,
          strict: true,
          schema: schemas[action],
        },
      },
      max_output_tokens: action === "explore" ? 5000 : 3000,
    }),
  });

  const raw = await response.json() as {
    error?: { message?: string };
    output_text?: string;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (!response.ok) throw new Error(raw.error?.message ?? `OpenAI request failed (${response.status}).`);
  const text = raw.output_text ?? raw.output?.flatMap((item) => item.content ?? []).find((item) => item.type === "output_text")?.text;
  if (!text) throw new Error("The model returned no structured output.");
  return JSON.parse(text);
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as { action?: AiAction; payload?: Record<string, unknown> };
    if (!body.action || !(body.action in schemas)) {
      return Response.json({ error: "A supported AI action is required." }, { status: 400 });
    }
    const serialized = JSON.stringify(body.payload ?? {});
    if (serialized.length > 16000) {
      return Response.json({ error: "This input is too long. Please shorten it and try again." }, { status: 413 });
    }
    const data = await callOpenAI(body.action, body.payload ?? {});
    return Response.json({ data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "AI request failed.";
    const status = message.includes("OPENAI_API_KEY") ? 503 : 500;
    return Response.json({ error: message }, { status });
  }
}
