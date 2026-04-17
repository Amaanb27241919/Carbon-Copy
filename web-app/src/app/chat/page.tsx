'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Send, Loader2, MessageSquare, ChevronDown, Cpu } from 'lucide-react';
import { coreApi, AIModel, ChatMessage } from '@/lib/api';
import { ChatBubble } from '@/components/ChatBubble';
import { PageHeader } from '@/components/PageHeader';
import { cn, getErrorMessage } from '@/lib/utils';
import { toast } from '@/components/Toast';

const SYSTEM_DEFAULT = 'carbon-ai';

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [showModelPicker, setShowModelPicker] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const { data: models = [] } = useQuery<AIModel[]>({
    queryKey: ['core-models'],
    queryFn: coreApi.getModels,
    staleTime: 60_000,
  });

  const availableModels = models.filter(m => m.available);

  useEffect(() => {
    if (availableModels.length > 0 && !selectedModel) {
      setSelectedModel(availableModels[0].id);
    }
  }, [availableModels, selectedModel]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending]);

  const currentModel = availableModels.find(m => m.id === selectedModel);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || sending) return;

    const userMsg: ChatMessage = { role: 'user', content: text, timestamp: new Date() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setSending(true);

    try {
      const allMessages = [
        ...messages.map(m => ({ role: m.role, content: m.content })),
        { role: 'user', content: text },
      ];
      const result = await coreApi.chat(allMessages, selectedModel || undefined);

      if (result.error) {
        toast('error', result.error);
        setMessages(prev => prev.filter(m => m !== userMsg));
        setInput(text);
        return;
      }

      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: result.content || '',
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      toast('error', getErrorMessage(err));
      // Remove the optimistic user message on error
      setMessages(prev => prev.filter(m => m !== userMsg));
      setInput(text);
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="min-h-screen flex flex-col pb-nav">
      <PageHeader
        title="Chat"
        subtitle={currentModel ? `${currentModel.name} · ${currentModel.provider}` : 'Select a model'}
        actions={
          <div className="relative">
            <button
              onClick={() => setShowModelPicker(p => !p)}
              className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3"
            >
              <Cpu className="w-3.5 h-3.5" />
              {currentModel?.name || 'Model'}
              <ChevronDown className="w-3 h-3" />
            </button>

            {showModelPicker && (
              <div className="absolute right-0 top-full mt-1 w-64 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
                <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest px-3 py-2">
                  Available Models
                </p>
                {availableModels.length === 0 ? (
                  <p className="text-xs text-slate-500 px-3 pb-3">No models available</p>
                ) : (
                  availableModels.map(m => (
                    <button
                      key={m.id}
                      onClick={() => { setSelectedModel(m.id); setShowModelPicker(false); }}
                      className={cn(
                        'w-full text-left px-3 py-2.5 text-xs transition-colors',
                        selectedModel === m.id
                          ? 'bg-indigo-900/40 text-indigo-300'
                          : 'text-slate-300 hover:bg-slate-700'
                      )}
                    >
                      <div className="font-medium">{m.name}</div>
                      <div className="text-slate-500 text-[10px]">{m.provider}</div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        }
      />

      {/* Messages area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
            <MessageSquare className="w-10 h-10 text-slate-700" />
            <p className="text-sm text-slate-500 font-medium">Start a conversation</p>
            <p className="text-xs text-slate-600">Chat with any model via the model router</p>
          </div>
        ) : (
          <>
            {messages.map((msg, i) => (
              <ChatBubble key={i} message={msg} />
            ))}
            {sending && (
              <div className="flex items-center gap-2 text-slate-500 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Thinking...</span>
              </div>
            )}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input area */}
      <div className="sticky bottom-0 px-4 pb-3 pt-2 bg-slate-950/95 backdrop-blur-xl border-t border-slate-800/60 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
        <div className="flex items-end gap-2">
          <textarea
            ref={inputRef}
            className="input flex-1 resize-none min-h-[44px] max-h-32 py-3 text-sm leading-relaxed"
            placeholder="Ask anything..."
            rows={1}
            value={input}
            onChange={e => {
              setInput(e.target.value);
              e.target.style.height = 'auto';
              e.target.style.height = `${Math.min(e.target.scrollHeight, 128)}px`;
            }}
            onKeyDown={handleKeyDown}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || sending}
            className={cn(
              'flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-150',
              input.trim() && !sending
                ? 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-lg shadow-indigo-900/40'
                : 'bg-slate-800 text-slate-600 cursor-not-allowed'
            )}
            aria-label="Send message"
          >
            {sending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
          </button>
        </div>
        <p className="text-[10px] text-slate-600 mt-1.5 text-center">
          Press Enter to send · Shift+Enter for newline
        </p>
      </div>
    </div>
  );
}
