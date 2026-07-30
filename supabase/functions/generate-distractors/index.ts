const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};

type WordItem = { answer: string; meaning: string; page?: string };

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'POST 요청만 사용할 수 있어요.' }), {
      status: 405,
      headers: corsHeaders,
    });
  }

  try {
    const body = await request.json();
    const words = Array.isArray(body.words) ? body.words as WordItem[] : [];

    if (words.length < 3 || words.length > 15) {
      return new Response(JSON.stringify({ error: '단어는 3개 이상 15개 이하로 보내주세요.' }), {
        status: 400,
        headers: corsHeaders,
      });
    }

    const apiKey = Deno.env.get('GEMINI_API_KEY');
    if (!apiKey) {
      return new Response(JSON.stringify({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았어요.' }), {
        status: 500,
        headers: corsHeaders,
      });
    }

    const configuredModel = Deno.env.get('GEMINI_MODEL');
    const model = configuredModel && configuredModel !== 'gemini-2.5-flash'
      ? configuredModel
      : 'gemini-3.5-flash-lite';
    const prompt = `
초등학생용 어휘 학습 게임의 매력적인 오답을 만들어 주세요.
아래 단어마다 정답과 헷갈리지만 뜻은 분명히 다른 오답 2개를 만듭니다.
오답은 같은 교과 주제나 비슷한 형태의 단어를 우선하고, 정답 자체나 이미 제시된 정답은 오답으로 쓰지 않습니다.
초등학생이 이해할 수 있는 일반적인 한국어 단어만 사용합니다.
설명이나 문장은 쓰지 말고 JSON 배열만 반환합니다.

입력 단어:
${JSON.stringify(words)}
`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  answer: { type: 'string' },
                  wrong: { type: 'array', items: { type: 'string' }, minItems: 2, maxItems: 2 },
                },
                required: ['answer', 'wrong'],
              },
            },
          },
        }),
      },
    );

    if (!response.ok) {
      const detail = await response.text();
      console.error('Gemini API error:', detail);
      return new Response(JSON.stringify({ error: `Gemini 오답 생성을 완료하지 못했어요. ${detail}` }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    const result = await response.json();
    const text = result?.candidates?.[0]?.content?.parts?.[0]?.text;
    const distractors = JSON.parse(text || '[]');

    if (!Array.isArray(distractors) || distractors.length !== words.length) {
      return new Response(JSON.stringify({ error: 'Gemini가 올바른 단어 목록을 반환하지 않았어요.' }), {
        status: 502,
        headers: corsHeaders,
      });
    }

    return new Response(JSON.stringify({ distractors }), { headers: corsHeaders });
  } catch (error) {
    console.error(error);
    return new Response(JSON.stringify({ error: '오답 생성 중 오류가 발생했어요.' }), {
      status: 500,
      headers: corsHeaders,
    });
  }
});
