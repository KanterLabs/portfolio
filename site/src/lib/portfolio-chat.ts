import { createStreamRenderer, renderAssistantMessage } from './portfolio-chat-render';

type ChatRole = 'user' | 'assistant';
type ChatMessage = { role: ChatRole; content: string };
type Source = { title: string; href: string };

const root = document.querySelector<HTMLElement>('[data-portfolio-chat]');

if (root) {
  const launcher = root.querySelector<HTMLButtonElement>('[data-chat-launcher]');
  const panel = root.querySelector<HTMLElement>('[data-chat-panel]');
  const closeButton = root.querySelector<HTMLButtonElement>('[data-chat-close]');
  const transcript = root.querySelector<HTMLElement>('[data-chat-transcript]');
  const form = root.querySelector<HTMLFormElement>('[data-chat-form]');
  const input = root.querySelector<HTMLTextAreaElement>('[data-chat-input]');
  const sendButton = root.querySelector<HTMLButtonElement>('[data-chat-send]');
  const status = root.querySelector<HTMLElement>('[data-chat-status]');
  const sources = root.querySelector<HTMLElement>('[data-chat-sources]');
  const retryButton = root.querySelector<HTMLButtonElement>('[data-chat-retry]');
  const starterButtons = Array.from(root.querySelectorAll<HTMLButtonElement>('[data-chat-starter]'));
  const starterSection = root.querySelector<HTMLElement>('.portfolio-chat-starters');

  if (
    launcher &&
    panel &&
    closeButton &&
    transcript &&
    form &&
    input &&
    sendButton &&
    status &&
    sources &&
    retryButton
  ) {
    const maxMessageLength = 800;
    const safetyIdKey = 'portfolio-chat-safety-id';
    const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    let messageHistory: ChatMessage[] = [];
    let activeController: AbortController | null = null;
    let requestSequence = 0;
    let isBusy = false;
    let lastFailedMessage = '';
    let panelCloseTimer: number | undefined;
    let panelFocusFrame: number | undefined;
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

    const setStatus = (message: string) => {
      status.textContent = message;
    };

    const scrollTranscript = () => {
      transcript.scrollTop = transcript.scrollHeight;
    };

    const createUuid = () => {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }

      if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
        const bytes = new Uint8Array(16);
        crypto.getRandomValues(bytes);
        bytes[6] = (bytes[6] & 0x0f) | 0x40;
        bytes[8] = (bytes[8] & 0x3f) | 0x80;
        const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
        return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
      }

      return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        const value = character === 'x' ? random : (random & 0x3) | 0x8;
        return value.toString(16);
      });
    };

    const getVisitorId = () => {
      try {
        const existingId = window.localStorage.getItem(safetyIdKey);
        if (existingId && uuidPattern.test(existingId)) return existingId;

        const newId = createUuid();
        window.localStorage.setItem(safetyIdKey, newId);
        return newId;
      } catch {
        // Private browsing and blocked storage should not prevent a chat request.
        return createUuid();
      }
    };

    const appendMessage = (role: ChatRole, content = '') => {
      const article = document.createElement('article');
      article.className = `portfolio-chat-message portfolio-chat-message-${role}`;
      const paragraph = document.createElement('p');
      paragraph.textContent = content;
      article.append(paragraph);
      transcript.append(article);
      scrollTranscript();
      return { article, paragraph };
    };

    const renderSources = (items: unknown) => {
      sources.textContent = '';
      const safeSources: Source[] = [];

      if (Array.isArray(items)) {
        items.forEach((item) => {
          if (!item || typeof item !== 'object') return;
          const candidate = item as { title?: unknown; href?: unknown };
          if (typeof candidate.href !== 'string' || typeof candidate.title !== 'string') return;
          const href = candidate.href.trim();
          const title = candidate.title.trim();
          if (!href.startsWith('/') || href.startsWith('//') || !title) return;
          safeSources.push({ href, title });
        });
      }

      if (safeSources.length === 0) {
        sources.hidden = true;
        return;
      }

      const label = document.createElement('p');
      label.className = 'portfolio-chat-label';
      label.textContent = 'Related pages';
      const list = document.createElement('ul');
      list.className = 'portfolio-chat-source-list';

      safeSources.forEach(({ title, href }) => {
        const item = document.createElement('li');
        const link = document.createElement('a');
        link.href = href;
        link.textContent = title;
        item.append(link);
        list.append(item);
      });

      sources.append(label, list);
      sources.hidden = false;
    };

    const setBusy = (busy: boolean) => {
      isBusy = busy;
      input.disabled = busy;
      sendButton.disabled = busy;
      starterButtons.forEach((button) => {
        button.disabled = busy;
      });
      sendButton.setAttribute('aria-busy', busy ? 'true' : 'false');
      if (!busy) input.maxLength = maxMessageLength;
    };

    const setPanelOpen = (open: boolean) => {
      if (panelFocusFrame !== undefined) {
        window.cancelAnimationFrame(panelFocusFrame);
        panelFocusFrame = undefined;
      }
      if (panelCloseTimer !== undefined) {
        window.clearTimeout(panelCloseTimer);
        panelCloseTimer = undefined;
      }

      if (open) {
        if (status.textContent === 'Chat closed.') setStatus('Ready when you are.');
        root.classList.remove('portfolio-chat-closing');
        panel.hidden = false;
        panel.setAttribute('aria-hidden', 'false');
        launcher.setAttribute('aria-expanded', 'true');
        root.classList.add('portfolio-chat-open');
        panelFocusFrame = window.requestAnimationFrame(() => {
          panelFocusFrame = undefined;
          input.focus();
        });
        return;
      }

      panel.setAttribute('aria-hidden', 'true');
      launcher.setAttribute('aria-expanded', 'false');
      root.classList.remove('portfolio-chat-open');

      const finishClose = () => {
        panel.hidden = true;
        root.classList.remove('portfolio-chat-closing');
        panelCloseTimer = undefined;
      };

      if (reducedMotion.matches) {
        finishClose();
      } else {
        root.classList.add('portfolio-chat-closing');
        panelCloseTimer = window.setTimeout(finishClose, 150);
      }
    };

    const closePanel = () => {
      if (activeController) {
        activeController.abort();
        activeController = null;
      }
      requestSequence += 1;
      setBusy(false);
      setStatus('Chat closed.');
      setPanelOpen(false);
      launcher.focus();
    };

    const isAbortError = (error: unknown) => {
      return Boolean(error && typeof error === 'object' && 'name' in error && error.name === 'AbortError');
    };

    const handleEvent = (
      block: string,
      onDelta: (delta: string) => void,
      onSources: (items: unknown) => void,
    ) => {
      const lines = block.split(/\r?\n/);
      let eventName = 'message';
      const dataLines: string[] = [];

      lines.forEach((line) => {
        if (line.startsWith(':')) return;
        if (line.startsWith('event:')) {
          eventName = line.slice(6).trim();
        } else if (line.startsWith('data:')) {
          dataLines.push(line.slice(5).trimStart());
        }
      });

      if (dataLines.length === 0 && eventName !== 'done') return false;

      let payload: unknown = {};
      if (dataLines.length > 0) {
        try {
          payload = JSON.parse(dataLines.join('\n')) as unknown;
        } catch {
          if (eventName === 'error') throw new Error('The assistant returned an unreadable error.');
          return false;
        }
      }

      if (eventName === 'done') return true;

      if (eventName === 'delta') {
        if (payload && typeof payload === 'object' && 'delta' in payload && typeof payload.delta === 'string') {
          onDelta(payload.delta);
        }
        return false;
      }

      if (eventName === 'sources') {
        if (payload && typeof payload === 'object' && 'sources' in payload) {
          onSources(payload.sources);
        }
        return false;
      }

      if (eventName === 'error') {
        const message =
          payload && typeof payload === 'object' && 'message' in payload && typeof payload.message === 'string'
            ? payload.message
            : 'The assistant is temporarily unavailable.';
        throw new Error(message);
      }

      // A few SSE clients omit `event: message` for a data-only delta.
      if (eventName === 'message' && payload && typeof payload === 'object') {
        if ('delta' in payload && typeof payload.delta === 'string') onDelta(payload.delta);
        if ('sources' in payload) onSources(payload.sources);
        if ('done' in payload && payload.done === true) return true;
      }

      return false;
    };

    const readSse = async (
      response: Response,
      onDelta: (delta: string) => void,
      onSources: (items: unknown) => void,
    ) => {
      if (!response.body) throw new Error('The assistant did not return a stream.');
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let complete = false;

      const processBuffer = () => {
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          if (handleEvent(block, onDelta, onSources)) {
            complete = true;
            break;
          }
        }
      };

      while (!complete) {
        const { value, done } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }
        buffer += decoder.decode(value, { stream: true });
        processBuffer();
      }

      if (!complete && buffer.trim()) handleEvent(buffer, onDelta, onSources);
    };

    const submitMessage = async (messageOverride?: string) => {
      if (isBusy) return;
      const rawMessage = messageOverride ?? input.value;
      const message = rawMessage.trim();

      if (!message) {
        setStatus('Enter a question first.');
        input.focus();
        return;
      }

      if (message.length > maxMessageLength) {
        input.value = message.slice(0, maxMessageLength);
        setStatus('Please keep your question under 800 characters.');
        input.focus();
        return;
      }

      input.value = '';
      if (starterSection) starterSection.hidden = true;
      retryButton.hidden = true;
      lastFailedMessage = '';
      renderSources([]);
      appendMessage('user', message);
      const { article: assistantMessage, paragraph: assistantParagraph } = appendMessage('assistant');
      assistantMessage.dataset.streaming = 'true';
      const controller = new AbortController();
      const sequence = ++requestSequence;
      activeController = controller;
      setBusy(true);
      setStatus('Thinking…');

      let streamRenderer: ReturnType<typeof createStreamRenderer> | undefined;

      try {
        const response = await fetch('/api/chat', {
          method: 'POST',
          headers: {
            Accept: 'text/event-stream',
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            message,
            history: messageHistory.slice(-6),
            pagePath: window.location.pathname,
            visitorId: getVisitorId(),
          }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error('The assistant is temporarily unavailable.');

        streamRenderer = createStreamRenderer(assistantParagraph, scrollTranscript);
        await readSse(
          response,
          (delta) => streamRenderer?.push(delta),
          (items) => renderSources(items),
        );
        let assistantText = streamRenderer.flush();
        assistantMessage.removeAttribute('data-streaming');

        if (!assistantText) {
          assistantText = 'I could not find an answer for that yet. Please try another question.';
        }

        renderAssistantMessage(assistantMessage, assistantText, scrollTranscript);

        if (sequence === requestSequence) {
          messageHistory = [...messageHistory, { role: 'user', content: message }, { role: 'assistant', content: assistantText }].slice(-6);
          setStatus('Response complete.');
        }
      } catch (error) {
        streamRenderer?.cancel();
        assistantMessage.removeAttribute('data-streaming');

        if (isAbortError(error) || sequence !== requestSequence) {
          if (!assistantParagraph.textContent) assistantMessage.remove();
          return;
        }

        assistantParagraph.textContent = 'I’m unavailable right now. Please try sending your question again.';
        scrollTranscript();
        lastFailedMessage = message;
        input.value = message;
        retryButton.hidden = false;
        const errorMessage = error instanceof Error && error.message ? error.message : 'The assistant is unavailable.';
        setStatus(`${errorMessage} Try again when you’re ready.`);
      } finally {
        if (sequence === requestSequence) {
          activeController = null;
          setBusy(false);
        }
      }
    };

    launcher.addEventListener('click', () => {
      setPanelOpen(true);
    });
    closeButton.addEventListener('click', closePanel);
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !panel.hidden) {
        event.preventDefault();
        closePanel();
      }
    });
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      void submitMessage();
    });
    input.addEventListener('input', () => {
      if (input.value.length > maxMessageLength) {
        input.value = input.value.slice(0, maxMessageLength);
        setStatus('Please keep your question under 800 characters.');
      }
    });
    retryButton.addEventListener('click', () => {
      if (!lastFailedMessage) return;
      void submitMessage(lastFailedMessage);
    });
    starterButtons.forEach((button) => {
      button.addEventListener('click', () => {
        if (isBusy) return;
        const question = button.textContent?.trim() ?? '';
        input.value = question;
        void submitMessage(question);
      });
    });
  }
}
