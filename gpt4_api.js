async function generateSummary(apiKey, prompt, summaryLength = 'short', language = 'en') {
  const lengthMap = { short: 50, medium: 100, long: 200 };
  const maxLength = lengthMap[summaryLength] || 100;
  console.log(language)

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      n: 1,
      model: 'gpt-4o-mini',
      stop: null,
      temperature: 0
    })
  });

  if (response.ok) {
    const data = await response.json();
    // let summary = data.choices[0].message.content.trim();
    //
    // if (language !== 'en') {
    //   const translationPrompt = `Translate the following English text to ${language}:\n\n${summary}`;
    //   const translationResponse = await fetch('https://api.openai.com/v1/engines/davinci-codex/completions', {
    //     method: 'POST',
    //     headers: {
    //       'Content-Type': 'application/json',
    //       'Authorization': `Bearer ${apiKey}`
    //     },
    //     body: JSON.stringify({
    //       prompt: translationPrompt,
    //       max_tokens: maxLength,
    //       n: 1,
    //       stop: null,
    //       temperature: 0.8
    //     })
    //   });
    //
    //   if (translationResponse.ok) {
    //     const translationData = await translationResponse.json();
    //     return translationData.choices[0].message.content.trim();
    //   } else {
    //     throw new Error('Translation request failed');
    //   }
    // } else {
    //   return summary;
    // }
    return data.choices[0].message.content.trim();
  } else {
    throw new Error('Summary request failed');
  }
}

async function translateSummary(apiKey, prompt,) {
 const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      messages: [{ role: 'user', content: prompt }],
      n: 1,
      model: 'gpt-3.5-turbo',
      stop: null,
      temperature: 0.8
    })
  });

  if (response.ok) {
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } else {
    throw new Error('Summary request failed');
  }
}

