const URL = 'http://127.0.0.1:5001/summary-ext/us-central1/generateChatCompletion';

export async function generateSummary(prompt) {
  const response = await fetch(URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'text/html'
    },
    body: JSON.stringify({ prompt })
  });
  if (response.ok) {
    return await response.json();
  } else {
    const { error } = await response.json();
    throw new Error(error.code);
  }
}
