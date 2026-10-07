// Optional, free, on-device inference. No chat endpoint or API key is used.
export const MODEL_ID = 'Qwen2.5-0.5B-Instruct-q4f32_1-MLC';

export function buildMessages(history, context = {}) {
  const title = String(context.title || '').slice(0, 100);
  const system = '你叫 KGY，是个人博客里的聊天助手。用自然、友好、简短的中文回答，通常两到四句。不使用幻想式称呼或角色扮演腔，不虚构个人经历。不知道就直接说明。你无法查询实时天气、新闻或价格，也不能实际操作网站。保持前后话题一致，不输出思考过程。' + (title ? `当前页面标题是《${title}》。` : '');
  let length = 0;
  const recent = [];
  for (const item of history.slice(-8).reverse()) {
    if (!['user', 'assistant'].includes(item.role)) continue;
    const content = String(item.content || '').slice(0, 320);
    if (!content) continue;
    if (length + content.length > 900 && recent.length) break;
    recent.unshift({ role: item.role, content }); length += content.length;
  }
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return [{ role: 'system', content: system }, ...recent];
}

function bounded(promise, signal, timeout) {
  return new Promise((resolve, reject) => {
    let timer;
    const finish = (fn, value) => { clearTimeout(timer); signal.removeEventListener('abort', abort); fn(value); };
    const abort = () => finish(reject, signal.reason || new Error('已取消'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    timer = setTimeout(() => finish(reject, new Error('等待时间较长，请重试')), timeout);
    Promise.resolve(promise).then(value => finish(resolve, value), error => finish(reject, error));
  });
}

export function createLocalAI(options = {}) {
  const gpu = Object.hasOwn(options, 'gpu') ? options.gpu : globalThis.navigator?.gpu;
  const loadLibrary = options.loadLibrary || (() => import('/vendor/webllm-0.2.85/index.js'));
  const makeWorker = options.makeWorker || (() => new Worker('/js/mascot-ai-worker.mjs?v=20261007-1', { type: 'module' }));
  const notify = options.onState || (() => {});
  let engine = null, worker = null, aborter = null, revision = 0, phase = 'off';
  const setState = (next, detail = {}) => { phase = next; notify(next, detail); };
  const cleanup = () => { worker?.terminate(); worker = null; engine = null; };
  function stop() {
    revision++; aborter?.abort(new Error('已取消')); cleanup(); setState('off');
  }
  async function start() {
    if (phase === 'ready' || phase === 'loading' || phase === 'generating') return;
    const current = ++revision;
    aborter = new AbortController(); const signal = aborter.signal;
    if (!gpu) { setState('unsupported'); return; }
    setState('loading', { progress: 0 });
    try {
      const adapter = await bounded(gpu.requestAdapter(), signal, 10000);
      if (!adapter) { setState('unsupported'); return; }
      const webllm = await bounded(loadLibrary(), signal, 30000);
      if (current !== revision) return;
      worker = makeWorker();
      worker.addEventListener('error', () => {
        aborter.abort(new Error('AI 未能正常运行，请重试'));
        if (phase === 'ready') { cleanup(); setState('error'); }
      });
      engine = new webllm.WebWorkerMLCEngine(worker, {
        logLevel: 'ERROR',
        appConfig: { ...webllm.prebuiltAppConfig, model_list: webllm.prebuiltAppConfig.model_list.filter(item => item.model_id === MODEL_ID) },
        initProgressCallback: progress => {
          if (current === revision) setState('loading', { progress: Math.max(0, Math.min(1, Number(progress.progress) || 0)) });
        }
      });
      await bounded(engine.reload(MODEL_ID, { context_window_size: 2048 }), signal, options.loadTimeout || 240000);
      if (current === revision) setState('ready');
    } catch (error) {
      if (current !== revision) return;
      cleanup(); setState('error', { message: error.message });
    }
  }
  async function generate(history, context, onText) {
    if (phase !== 'ready') throw new Error('AI 尚未就绪');
    const current = revision, signal = aborter.signal;
    setState('generating');
    let text = '';
    const run = async () => {
      const chunks = await engine.chat.completions.create({ messages: buildMessages(history, context), stream: true, temperature: .65, max_tokens: 192, repetition_penalty: 1.08 });
      for await (const chunk of chunks) {
        if (current !== revision || signal.aborted) throw new Error('已取消');
        text += chunk.choices[0]?.delta.content || '';
        if (text) onText(text);
      }
      if (!text.trim()) throw new Error('AI 没有返回内容，请重试');
      return text.trim();
    };
    try {
      const reply = await bounded(run(), signal, options.replyTimeout || 60000);
      if (current === revision) setState('ready');
      return reply;
    } catch (error) {
      if (current === revision) { revision++; aborter.abort(error); cleanup(); setState('error', { message: error.message }); }
      throw error;
    }
  }
  return { start, stop, generate, get phase() { return phase; } };
}
