# Nuance

Nuance is a vocabulary-learning website for exploring the subtle differences between related English words. It combines an interactive word map with contextual word recommendations, contrast-based practice, and a shared Word of the Day.

## Features

- Sense-aware maps with synonyms, related words, and opposites
- Expandable comparisons covering meaning, register, connotation, collocations, examples, and misuse
- Contextual word-choice recommendations with sentence previews
- Optional academic rewriting
- Saved contrast groups and adaptive practice
- Shared Word of the Day
- Light and dark themes with responsive desktop and mobile layouts

## Local development

1. Install Node.js 22 or newer and pnpm.
2. Install dependencies with `pnpm install`.
3. Copy `.env.example` to `.env.local`.
4. Add a newly created OpenAI API key to `.env.local`.
5. Start the site with `pnpm dev`.

Never commit `.env.local` or place an API key in browser-side code.

## Environment variables

```env
OPENAI_API_KEY=replace_with_your_private_key
OPENAI_MODEL=gpt-5.4-mini
```

OpenAI requests are routed through the server endpoint at `app/api/ai/route.ts` so the key is never exposed to visitors.

## Production

The project builds to a Cloudflare Worker-compatible output. Configure `OPENAI_API_KEY` as an encrypted hosting secret rather than uploading a local environment file.
