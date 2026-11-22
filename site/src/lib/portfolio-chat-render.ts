const appendInlineFormatting = (element: HTMLElement, text: string) => {
  const segments = text.split(/(\*\*[^*\n]+\*\*)/g);

  for (const segment of segments) {
    if (segment.startsWith('**') && segment.endsWith('**')) {
      const strong = document.createElement('strong');
      strong.textContent = segment.slice(2, -2);
      element.append(strong);
    } else if (segment) {
      element.append(document.createTextNode(segment));
    }
  }
};

const assistantBlocks = (text: string) => {
  const lines: string[] = [];

  for (const sourceLine of text.replace(/\r\n?/g, '\n').split('\n')) {
    const inlineListStart = sourceLine.indexOf(': - ');
    if (inlineListStart === -1) {
      lines.push(sourceLine);
      continue;
    }

    lines.push(sourceLine.slice(0, inlineListStart + 1));
    for (const item of sourceLine.slice(inlineListStart + 3).split(' - ')) {
      lines.push(`- ${item}`);
    }
  }

  return lines;
};

export const renderAssistantMessage = (article: HTMLElement, text: string, scrollTranscript: () => void) => {
  article.textContent = '';
  const lines = assistantBlocks(text);
  let index = 0;

  while (index < lines.length) {
    const line = lines[index]?.trim() ?? '';
    if (!line) {
      index += 1;
      continue;
    }

    const unorderedMatch = line.match(/^[-*]\s+(.+)$/);
    const orderedMatch = line.match(/^\d+[.)]\s+(.+)$/);
    if (unorderedMatch || orderedMatch) {
      const list = document.createElement(orderedMatch ? 'ol' : 'ul');
      while (index < lines.length) {
        const itemLine = lines[index]?.trim() ?? '';
        const itemMatch = orderedMatch
          ? itemLine.match(/^\d+[.)]\s+(.+)$/)
          : itemLine.match(/^[-*]\s+(.+)$/);
        if (!itemMatch) break;

        const item = document.createElement('li');
        appendInlineFormatting(item, itemMatch[1]);
        list.append(item);
        index += 1;
      }
      article.append(list);
      continue;
    }

    const paragraphLines = [line];
    index += 1;
    while (index < lines.length) {
      const nextLine = lines[index]?.trim() ?? '';
      if (!nextLine || /^[-*]\s+/.test(nextLine) || /^\d+[.)]\s+/.test(nextLine)) break;
      paragraphLines.push(nextLine);
      index += 1;
    }

    const paragraph = document.createElement('p');
    appendInlineFormatting(paragraph, paragraphLines.join(' '));
    article.append(paragraph);
  }

  scrollTranscript();
};

export const createStreamRenderer = (paragraph: HTMLParagraphElement, scrollTranscript: () => void) => {
  let frameId: number | undefined;
  let renderedText = '';
  let pendingText = '';

  const paint = () => {
    frameId = undefined;
    if (!pendingText) return;
    renderedText += pendingText;
    pendingText = '';
    paragraph.textContent = renderedText;
    scrollTranscript();
  };

  return {
    push(delta: string) {
      pendingText += delta;
      if (frameId === undefined) frameId = window.requestAnimationFrame(paint);
    },
    flush() {
      if (frameId !== undefined) {
        window.cancelAnimationFrame(frameId);
        frameId = undefined;
      }
      paint();
      return renderedText;
    },
    cancel() {
      if (frameId !== undefined) window.cancelAnimationFrame(frameId);
      frameId = undefined;
      pendingText = '';
    },
  };
};
