import { useState, useRef, useEffect } from 'react';
import { chatWithReport, type ChatMessage } from '../api/client';

interface Props {
  runId: string | number;
}

export default function ReportChat({ runId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: text };
    const updated = [...messages, userMsg];
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const { response } = await chatWithReport(runId, text, messages);
      setMessages([...updated, { role: 'assistant', content: response }]);
    } catch {
      setMessages([...updated, { role: 'assistant', content: 'Sorry, something went wrong. Please try again.' }]);
    } finally {
      setLoading(false);
    }
  };

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // Mobile toggle button (shown below lg breakpoint)
  const toggleBtn = (
    <button
      onClick={() => setOpen(!open)}
      className="lg:hidden fixed bottom-4 right-4 z-50 w-12 h-12 rounded-full bg-amber text-bg flex items-center justify-center shadow-lg hover:bg-amber-glow transition-colors"
      aria-label="Toggle chat"
    >
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        {open ? (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        ) : (
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
        )}
      </svg>
    </button>
  );

  const chatPanel = (
    <div className={`
      flex flex-col bg-bg-card border border-line rounded-lg overflow-hidden
      lg:h-[calc(100vh-6rem)] lg:sticky lg:top-8
      ${open ? 'fixed inset-x-0 bottom-0 h-[60vh] z-40 rounded-t-xl rounded-b-none border-b-0' : 'hidden lg:flex'}
    `}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-line shrink-0">
        <h3 className="text-xs font-mono text-amber tracking-widest uppercase">Chat</h3>
        <button
          onClick={() => setOpen(false)}
          className="lg:hidden text-cream-muted hover:text-cream text-sm"
        >
          Close
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 min-h-0">
        {messages.length === 0 && (
          <p className="text-sm text-cream-faint text-center mt-8">
            Ask about this report
          </p>
        )}
        {messages.map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={`max-w-[85%] px-3 py-2 rounded-lg text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user'
                  ? 'bg-amber/15 text-cream border border-amber/20'
                  : 'bg-bg-inset text-cream-dim border border-line'
              }`}
            >
              {msg.content}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="bg-bg-inset border border-line px-3 py-2 rounded-lg">
              <span className="inline-flex gap-1">
                <span className="w-1.5 h-1.5 bg-cream-faint rounded-full animate-pulse" />
                <span className="w-1.5 h-1.5 bg-cream-faint rounded-full animate-pulse [animation-delay:150ms]" />
                <span className="w-1.5 h-1.5 bg-cream-faint rounded-full animate-pulse [animation-delay:300ms]" />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-3 py-3 border-t border-line shrink-0">
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKey}
            placeholder="Ask about this report..."
            disabled={loading}
            className="flex-1 bg-bg-inset border border-line rounded-lg px-3 py-2 text-sm text-cream placeholder:text-cream-faint focus:outline-none focus:border-amber/40 disabled:opacity-50"
          />
          <button
            onClick={send}
            disabled={loading || !input.trim()}
            className="px-3 py-2 bg-amber text-bg rounded-lg text-sm font-medium hover:bg-amber-glow transition-colors disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {toggleBtn}
      {chatPanel}
    </>
  );
}
