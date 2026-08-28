import { useCallback, useState } from 'react';

import { askGuide } from '../api';
import type { GuideMessage } from '../types';

/** What the bot says before it has been asked anything. */
export const GREETING: GuideMessage = {
  role: 'assistant',
  content: 'CARD:N 사용법을 안내해 드려요. 궁금한 걸 물어보세요.',
};

/**
 * Chips for the opening screen, so the first question costs no typing.
 *
 * Written here rather than fetched because they are needed before there is anything to
 * send. The server has its own list for when it cannot match a question — that one is
 * longer, and it is the one that matters, so these three are only a starter.
 */
export const STARTERS = [
  '명함은 어떻게 등록해요?',
  '대화 녹음은 어디서 해요?',
  '관계도는 뭘 보여주나요?',
];

function messageOf(error: unknown, fallback: string): string {
  // Same shape as useConversationFlow's helper — FastAPI's {detail: "..."} is what the
  // user should see, and axios buries it under response.data.
  const detail = (error as { response?: { data?: { detail?: string } } })?.response?.data?.detail;
  if (typeof detail === 'string' && detail) return detail;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}

/**
 * One guide chat session, held entirely in memory.
 *
 * The server keeps no session, so this hook's `messages` array is the conversation —
 * closing the sheet and reopening it starts over, which is what a help bot should do.
 */
export function useGuideChat() {
  const [messages, setMessages] = useState<GuideMessage[]>([GREETING]);
  const [suggestions, setSuggestions] = useState<string[]>(STARTERS);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ask = useCallback(async (history: GuideMessage[]) => {
    setPending(true);
    setError(null);
    try {
      const { reply, suggestions: offered } = await askGuide(history);
      setMessages([...history, { role: 'assistant', content: reply }]);
      // Empty whenever the question was understood — an answer that stands on its own
      // does not want a menu under it.
      setSuggestions(offered);
    } catch (e) {
      // The question stays on screen so "다시 시도" has something to resend, and so the
      // user can see what they asked rather than having it vanish with the error.
      setMessages(history);
      setError(messageOf(e, '답변을 받지 못했어요. 잠시 후 다시 시도해 주세요.'));
    } finally {
      setPending(false);
    }
  }, []);

  const send = useCallback(
    (text: string) => {
      const question = text.trim();
      if (!question || pending) return;
      void ask([...messages, { role: 'user', content: question }]);
    },
    [ask, messages, pending],
  );

  /** Resend the last question — `messages` already ends with it after a failure. */
  const retry = useCallback(() => {
    if (pending || messages[messages.length - 1]?.role !== 'user') return;
    void ask(messages);
  }, [ask, messages, pending]);

  const reset = useCallback(() => {
    setMessages([GREETING]);
    setSuggestions(STARTERS);
    setError(null);
  }, []);

  return {
    messages,
    pending,
    error,
    send,
    retry,
    reset,
    /** Starters before the first question, then whatever the server offers on a miss. */
    suggestions: pending ? [] : suggestions,
  };
}
