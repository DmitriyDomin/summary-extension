// Pure helpers shared by the content scripts: prompt building, parsing of model replies and
// parsing of YouTube caption files. No DOM or chrome.* access, so they are unit tested in Node.
(function (root) {
  const WORD_COUNTS = { short: 50, medium: 100, long: 200 };
  const DEFAULT_MAX_TRANSCRIPT_CHARS = 80000;

  function formatTimestamp(totalSeconds) {
    const s = Math.max(0, Math.floor(Number(totalSeconds) || 0));
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  // The prompts ask for "(Title)" and "[language]"; models sometimes skip them, so never throw.
  function extractTitle(text, fallback = 'Summary') {
    const match = typeof text === 'string' ? text.match(/\(([^)]+)\)/) : null;
    if (!match) return [text, fallback];
    return [text.replace(`(${match[1]})`, '').trim(), match[1]];
  }

  function extractLanguage(text, fallback = 'en') {
    const match = typeof text === 'string' ? text.match(/\[(.*?)\]/) : null;
    if (!match) return [text, fallback];
    return [text.replace(`[${match[1]}]`, '').trim(), match[1]];
  }

  function truncateTranscript(transcript, maxChars = DEFAULT_MAX_TRANSCRIPT_CHARS) {
    const text = String(transcript || '');
    return text.length > maxChars ? `${text.slice(0, maxChars)}\n[transcript truncated]` : text;
  }

  function buildPageSummaryPrompt({ text, title, url, length = 'medium' } = {}) {
    const words = WORD_COUNTS[length] || WORD_COUNTS.medium;
    const ask = `Include a clear title in parentheses () and indicate the original language in square brackets [].`;
    if (title === undefined && url === undefined) {
      return `${text}\n\nSummarize the following text to approximately ${words} words. ${ask}`;
    }
    return `Title: ${title}\nURL: ${url}\nContent: ${text}\n\nSummarize this webpage content to approximately ${words} words. ${ask}`;
  }

  function buildLecturePrompt({ courseTitle, lessonTitle, transcript, withMetadataRequest = false } = {}) {
    const ask = withMetadataRequest ? ' Include a title in parentheses () and language in brackets [].' : '';
    return `Course: ${courseTitle}\nLesson: ${lessonTitle}\n\nTranscript: ${transcript}\n\nSummarize this Udemy lecture transcript in a clear and concise manner.${ask}`;
  }

  const TIME_HINTS = ['time', 'when', 'where', 'minute', 'part', 'section'];

  // Prompt for the live chat: the video context, recent turns, then the user's question.
  function buildChatPrompt({ video, chatHistory = [], message, isAutomatic = false, maxHistory = 5 } = {}) {
    let prompt = '';

    if (video && video.transcript) {
      prompt += `Video Title: ${video.title}\nVideo URL: ${video.url}\n`;
      if (Array.isArray(video.timestampedTranscript) && video.timestampedTranscript.length) {
        prompt += 'Timestamped Transcript:\n';
        video.timestampedTranscript.forEach((segment) => {
          prompt += `[${segment.timestamp}] ${segment.text}\n`;
        });
        prompt += '\n';
      } else {
        prompt += `Transcript: ${video.transcript}\n\n`;
      }
    }

    if (chatHistory.length && !isAutomatic) {
      prompt += 'Previous Conversation:\n';
      chatHistory.slice(-maxHistory).forEach((chat) => {
        if (chat.type !== 'summary') prompt += `User: ${chat.message}\n`;
        prompt += `Assistant: ${chat.response}\n\n`;
      });
      prompt += '---\n\n';
    }

    if (isAutomatic) return prompt + message;

    prompt += `Based on the video content above, please answer this question: ${message}`;
    const lower = String(message).toLowerCase();
    if (TIME_HINTS.some((hint) => lower.includes(hint))) {
      prompt += '\n\nIMPORTANT: If relevant to the question, provide specific timestamps in the format [MM:SS] where the user can find the information in the video. Make these timestamps clickable references to the exact moments in the video.';
    }
    prompt += '\n\nPlease provide a detailed and helpful response. If you reference specific parts of the video, include the relevant timestamps so the user can easily navigate to those sections.';
    return prompt;
  }

  function decodeEntities(text) {
    const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
    const once = (value) =>
      value.replace(/&(?:#(\d+)|#x([0-9a-f]+)|(amp|lt|gt|quot|apos));/gi, (_, dec, hex, name) => {
        if (name) return named[name.toLowerCase()];
        const code = dec ? parseInt(dec, 10) : parseInt(hex, 16);
        return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
      });
    // YouTube sometimes double encodes ("&amp;#39;"), so a second pass fixes those.
    const first = once(String(text));
    return /&(?:#\d+|#x[0-9a-f]+|amp|lt|gt|quot|apos);/i.test(first) ? once(first) : first;
  }

  function makeSegment(text, startSeconds, durationSeconds) {
    const startTime = Math.floor(startSeconds);
    return {
      text,
      startTime,
      endTime: startTime + Math.floor(durationSeconds),
      timestamp: formatTimestamp(startTime),
      youtubeTimestamp: `${startTime}s`,
    };
  }

  function joinSegments(segments) {
    return segments.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim();
  }

  // json3 caption format (fmt=json3).
  function parseJson3Transcript(data) {
    if (!data || !Array.isArray(data.events)) return null;
    const segments = [];
    data.events
      .filter((e) => e.segs && e.tStartMs !== undefined)
      .forEach((e) => {
        const text = e.segs.map((s) => s.utf8 || '').join('').trim();
        if (!text) return;
        segments.push(makeSegment(text, e.tStartMs / 1000, e.dDurationMs ? e.dDurationMs / 1000 : 5));
      });
    if (!segments.length) return null;
    return { transcript: joinSegments(segments), segments };
  }

  // Legacy timedtext XML: <text start="1.2" dur="3.4">...</text>
  function parseXmlTranscript(xml) {
    const segments = [];
    const pattern = /<text\b([^>]*)>([\s\S]*?)<\/text>/g;
    let match;
    while ((match = pattern.exec(String(xml || '')))) {
      const text = decodeEntities(match[2]).replace(/\s+/g, ' ').trim();
      if (!text) continue;
      const start = /\bstart="([\d.]+)"/.exec(match[1]);
      const dur = /\bdur="([\d.]+)"/.exec(match[1]);
      segments.push(makeSegment(text, start ? parseFloat(start[1]) : 0, dur ? parseFloat(dur[1]) : 5));
    }
    if (!segments.length) return null;
    return { transcript: joinSegments(segments), segments };
  }

  // Both formats, picked by what the file looks like. Very short results are treated as no transcript.
  function parseTranscriptFile(text, minLength = 50) {
    const body = String(text || '').trim();
    let result = null;
    if (body.startsWith('{')) {
      try {
        result = parseJson3Transcript(JSON.parse(body));
      } catch (_) {
        result = null;
      }
    } else if (body.startsWith('<')) {
      result = parseXmlTranscript(body);
    }
    return result && result.transcript.length >= minLength ? result : null;
  }

  // "1:05" or "1:02:03" to seconds; null when it is not a clock time.
  function parseClockTime(text) {
    const match = /^(?:(\d+):)?(\d{1,2}):(\d{2})$/.exec(String(text || '').trim());
    if (!match) return null;
    return Number(match[1] || 0) * 3600 + Number(match[2]) * 60 + Number(match[3]);
  }

  // Rows read from YouTube's transcript panel: [{ timestamp: '0:01', text: '...' }].
  // A segment ends when the next one starts; the last one gets a short default.
  function segmentsFromRows(rows, lastDuration = 5) {
    const parsed = (rows || [])
      .map((row) => ({ text: String(row.text || '').replace(/\s+/g, ' ').trim(), start: parseClockTime(row.timestamp) }))
      .filter((row) => row.text);
    if (!parsed.length) return null;
    const segments = parsed.map((row, i) => {
      const start = row.start === null ? (i ? parsed[i - 1].start || 0 : 0) : row.start;
      row.start = start;
      return row;
    }).map((row, i, all) => {
      const next = all[i + 1];
      return makeSegment(row.text, row.start, next && next.start > row.start ? next.start - row.start : lastDuration);
    });
    return { transcript: joinSegments(segments), segments };
  }

  // English manual captions first, then any English, then auto-generated, then whatever exists.
  function pickCaptionTrack(tracks) {
    if (!Array.isArray(tracks) || !tracks.length) return null;
    return (
      tracks.find((t) => t.languageCode === 'en' && !t.kind) ||
      tracks.find((t) => t.languageCode && t.languageCode.startsWith('en')) ||
      tracks.find((t) => t.kind === 'asr') ||
      tracks[0]
    );
  }

  const api = {
    WORD_COUNTS,
    formatTimestamp,
    extractTitle,
    extractLanguage,
    truncateTranscript,
    buildPageSummaryPrompt,
    buildLecturePrompt,
    buildChatPrompt,
    decodeEntities,
    parseJson3Transcript,
    parseXmlTranscript,
    parseTranscriptFile,
    parseClockTime,
    segmentsFromRows,
    pickCaptionTrack,
  };

  root.SummaryUtils = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : self);
