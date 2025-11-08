#!/usr/bin/env node
import { writeFileSync } from 'fs';
import { execSync } from 'child_process';

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPOSITORY = process.env.GITHUB_REPOSITORY;
const PR_NUMBER = process.env.GITHUB_REF?.match(/refs\/pull\/(\d+)\//)?.[1];

if (!OPENAI_API_KEY) {
  console.error('OPENAI_API_KEY não configurada. Pulando AI review.');
  process.exit(0);
}

if (!PR_NUMBER) {
  console.error('Não foi possível detectar o número do PR. Pulando AI review.');
  process.exit(0);
}

async function getPRDiff() {
  const url = `https://api.github.com/repos/${GITHUB_REPOSITORY}/pulls/${PR_NUMBER}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `token ${GITHUB_TOKEN}`,
      Accept: 'application/vnd.github.v3.diff',
    },
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch PR diff: ${response.statusText}`);
  }
  return await response.text();
}

async function callOpenAI(diff) {
  const prompt = `Você é um revisor de código experiente. Analise o diff abaixo e forneça:
1. Pontos positivos (se houver)
2. Problemas ou melhorias sugeridas (segurança, performance, legibilidade, testes)
3. Resumo geral

Seja conciso e objetivo. Use Markdown.

\`\`\`diff
${diff.slice(0, 8000)}
\`\`\`
`;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.3,
      max_tokens: 1500,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} ${error}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || 'Nenhuma análise retornada.';
}

async function main() {
  console.log(`Gerando AI review para PR #${PR_NUMBER}...`);
  const diff = await getPRDiff();
  
  if (!diff || diff.trim().length === 0) {
    console.log('Nenhuma mudança detectada no PR. Pulando review.');
    process.exit(0);
  }

  const review = await callOpenAI(diff);
  
  const markdown = `## 🤖 AI Code Review

${review}

---
*Revisão gerada por ${OPENAI_MODEL} • Este é um feedback automatizado e pode conter imprecisões.*
`;

  writeFileSync('ai-review.md', markdown, 'utf8');
  console.log('✓ AI review salvo em ai-review.md');
}

main().catch((err) => {
  console.error('Erro ao gerar AI review:', err);
  process.exit(1);
});
