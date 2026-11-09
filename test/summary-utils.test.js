const { test } = require('node:test');
const assert = require('node:assert');
const U = require('../summary-utils.js');

test('formatTimestamp pads seconds and keeps minutes unbounded', () => {
  assert.strictEqual(U.formatTimestamp(0), '0:00');
  assert.strictEqual(U.formatTimestamp(65), '1:05');
  assert.strictEqual(U.formatTimestamp(4503), '75:03');
  assert.strictEqual(U.formatTimestamp(-4), '0:00');
  assert.strictEqual(U.formatTimestamp('abc'), '0:00');
});

test('extractTitle pulls the first parenthesised title and removes it', () => {
  assert.deepStrictEqual(U.extractTitle('(Intro to RAG) Retrieval adds context.'), ['Retrieval adds context.', 'Intro to RAG']);
});

test('extractTitle and extractLanguage never throw when the model skips the markers', () => {
  assert.deepStrictEqual(U.extractTitle('No title here', 'Fallback'), ['No title here', 'Fallback']);
  assert.deepStrictEqual(U.extractLanguage('No language here'), ['No language here', 'en']);
  assert.deepStrictEqual(U.extractTitle(undefined, 'Fallback'), [undefined, 'Fallback']);
});

test('extractLanguage reads the bracketed language', () => {
  assert.deepStrictEqual(U.extractLanguage('Hola mundo [Spanish]'), ['Hola mundo', 'Spanish']);
});

test('truncateTranscript only cuts long text and says so', () => {
  assert.strictEqual(U.truncateTranscript('short', 10), 'short');
  assert.strictEqual(U.truncateTranscript('x'.repeat(20), 10), `${'x'.repeat(10)}\n[transcript truncated]`);
  assert.strictEqual(U.truncateTranscript(null), '');
});

test('page prompts use the word count for the chosen length', () => {
  const selection = U.buildPageSummaryPrompt({ text: 'abc', length: 'short' });
  assert.ok(selection.startsWith('abc\n\n'));
  assert.ok(selection.includes('approximately 50 words'));
  const page = U.buildPageSummaryPrompt({ text: 'body', title: 'T', url: 'https://x.test', length: 'long' });
  assert.ok(page.startsWith('Title: T\nURL: https://x.test\nContent: body'));
  assert.ok(page.includes('approximately 200 words'));
  assert.ok(U.buildPageSummaryPrompt({ text: 'x', length: 'bogus' }).includes('approximately 100 words'));
});

test('lecture prompt carries course, lesson and transcript; metadata ask is optional', () => {
  const base = U.buildLecturePrompt({ courseTitle: 'C', lessonTitle: 'L', transcript: 'T' });
  assert.ok(base.startsWith('Course: C\nLesson: L\n\nTranscript: T'));
  assert.ok(!base.includes('brackets'));
  assert.ok(U.buildLecturePrompt({ courseTitle: 'C', lessonTitle: 'L', transcript: 'T', withMetadataRequest: true }).includes('language in brackets []'));
});

test('chat prompt prefers the timestamped transcript and skips the summary turn', () => {
  const video = { title: 'V', url: 'u', transcript: 'plain', timestampedTranscript: [{ timestamp: '0:05', text: 'hi' }] };
  const history = [
    { type: 'summary', response: 'S' },
    { message: 'q1', response: 'a1' },
  ];
  const prompt = U.buildChatPrompt({ video, chatHistory: history, message: 'What is it?' });
  assert.ok(prompt.includes('[0:05] hi'));
  assert.ok(!prompt.includes('Transcript: plain'));
  assert.ok(prompt.includes('User: q1\nAssistant: a1'));
  assert.ok(!prompt.includes('User: undefined'));
  assert.ok(prompt.includes('please answer this question: What is it?'));
  assert.ok(!prompt.includes('IMPORTANT'));
});

test('chat prompt falls back to the plain transcript and keeps only recent turns', () => {
  const history = Array.from({ length: 8 }, (_, i) => ({ message: `q${i}`, response: `a${i}` }));
  const prompt = U.buildChatPrompt({ video: { title: 'V', url: 'u', transcript: 'plain text' }, chatHistory: history, message: 'x' });
  assert.ok(prompt.includes('Transcript: plain text'));
  assert.ok(!prompt.includes('q2'));
  assert.ok(prompt.includes('q3') && prompt.includes('q7'));
});

test('chat prompt asks for timestamps when the question is about time or place', () => {
  const prompt = U.buildChatPrompt({ video: { title: 'V', url: 'u', transcript: 't' }, message: 'When do they discuss pricing?' });
  assert.ok(prompt.includes('IMPORTANT'));
});

test('automatic prompts are sent as is and ignore history', () => {
  const prompt = U.buildChatPrompt({ video: { title: 'V', url: 'u', transcript: 't' }, chatHistory: [{ message: 'q', response: 'a' }], message: 'Summarize.', isAutomatic: true });
  assert.ok(prompt.endsWith('Summarize.'));
  assert.ok(!prompt.includes('Previous Conversation'));
});

test('decodeEntities handles named, numeric and double encoded entities', () => {
  assert.strictEqual(U.decodeEntities('Tom &amp; Jerry &lt;3 &quot;hi&quot;'), 'Tom & Jerry <3 "hi"');
  assert.strictEqual(U.decodeEntities('it&#39;s &#x41;'), "it's A");
  assert.strictEqual(U.decodeEntities('it&amp;#39;s'), "it's");
});

test('json3 captions become timestamped segments', () => {
  const result = U.parseJson3Transcript({
    events: [
      { tStartMs: 0, dDurationMs: 2500, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
      { tStartMs: 1000 },
      { tStartMs: 65000, segs: [{ utf8: '\n' }] },
      { tStartMs: 75000, segs: [{ utf8: 'Second line' }] },
    ],
  });
  assert.strictEqual(result.transcript, 'Hello world Second line');
  assert.strictEqual(result.segments.length, 2);
  assert.deepStrictEqual(result.segments[1], { text: 'Second line', startTime: 75, endTime: 80, timestamp: '1:15', youtubeTimestamp: '75s' });
  assert.strictEqual(result.segments[0].endTime, 2);
});

test('json3 without usable events returns null', () => {
  assert.strictEqual(U.parseJson3Transcript({ events: [{ tStartMs: 0 }] }), null);
  assert.strictEqual(U.parseJson3Transcript({}), null);
  assert.strictEqual(U.parseJson3Transcript(null), null);
});

test('timedtext XML is parsed with timestamps and decoded text', () => {
  const xml = '<?xml version="1.0"?><transcript><text start="0.5" dur="2.1">Tom &amp;amp; Jerry</text><text start="3" dur="1">it&amp;#39;s fine</text><text start="9"> </text></transcript>';
  const result = U.parseXmlTranscript(xml);
  assert.strictEqual(result.segments.length, 2);
  assert.strictEqual(result.segments[0].text, 'Tom & Jerry');
  assert.strictEqual(result.segments[1].text, "it's fine");
  assert.strictEqual(result.segments[1].timestamp, '0:03');
  assert.strictEqual(U.parseXmlTranscript('<transcript></transcript>'), null);
});

test('parseTranscriptFile detects the format and rejects empty or tiny transcripts', () => {
  const long = 'This is a sentence that is comfortably longer than fifty characters in total.';
  const json = JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: long }] }] });
  assert.strictEqual(U.parseTranscriptFile(json).transcript, long);
  assert.strictEqual(U.parseTranscriptFile(`<transcript><text start="0" dur="1">${long}</text></transcript>`).transcript, long);
  assert.strictEqual(U.parseTranscriptFile(''), null);
  assert.strictEqual(U.parseTranscriptFile('{not json'), null);
  assert.strictEqual(U.parseTranscriptFile(JSON.stringify({ events: [{ tStartMs: 0, segs: [{ utf8: 'too short' }] }] })), null);
});

test('pickCaptionTrack prefers manual English, then any English, then auto captions', () => {
  const manual = { languageCode: 'en' };
  const british = { languageCode: 'en-GB' };
  const auto = { languageCode: 'de', kind: 'asr' };
  const other = { languageCode: 'fr' };
  assert.strictEqual(U.pickCaptionTrack([other, auto, british, manual]), manual);
  assert.strictEqual(U.pickCaptionTrack([other, auto, british]), british);
  assert.strictEqual(U.pickCaptionTrack([other, auto]), auto);
  assert.strictEqual(U.pickCaptionTrack([other]), other);
  assert.strictEqual(U.pickCaptionTrack([{ languageCode: 'en', kind: 'asr' }, other]).kind, 'asr');
  assert.strictEqual(U.pickCaptionTrack([]), null);
  assert.strictEqual(U.pickCaptionTrack(undefined), null);
});

test('parseClockTime reads m:ss and h:mm:ss only', () => {
  assert.strictEqual(U.parseClockTime('0:01'), 1);
  assert.strictEqual(U.parseClockTime('12:34'), 754);
  assert.strictEqual(U.parseClockTime('1:02:03'), 3723);
  assert.strictEqual(U.parseClockTime('soon'), null);
  assert.strictEqual(U.parseClockTime(''), null);
});

test('segmentsFromRows ends each segment where the next starts', () => {
  const result = U.segmentsFromRows([
    { timestamp: '0:01', text: 'First' },
    { timestamp: '0:09', text: '  Second  ' },
    { timestamp: '', text: 'Third without time' },
    { timestamp: '0:30', text: '   ' },
  ]);
  assert.strictEqual(result.segments.length, 3);
  assert.deepStrictEqual(result.segments.map((s) => [s.startTime, s.endTime]), [[1, 9], [9, 14], [9, 14]]);
  assert.strictEqual(result.segments[1].text, 'Second');
  assert.strictEqual(result.transcript, 'First Second Third without time');
  assert.strictEqual(U.segmentsFromRows([]), null);
  assert.strictEqual(U.segmentsFromRows([{ timestamp: '0:01', text: ' ' }]), null);
});
