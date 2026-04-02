'use client';

import { cn, formatTime } from '@/lib/utils';
import type { ChatMessage } from '@/lib/api';

interface ChatBubbleProps {
  message: ChatMessage;
  className?: string;
}

export function ChatBubble({ message, className }: ChatBubbleProps) {
  const isUser = message.role === 'user';
  const isAssistant = message.role === 'assistant';

  return (
    <div
      className={cn(
        'flex flex-col gap-1',
        isUser ? 'items-end' : 'items-start',
        className
      )}
      role="article"
      aria-label={`${isUser ? 'Your' : 'Assistant'} message`}
    >
      {/* Role label */}
      <span className="text-[10px] font-medium text-slate-500 px-1">
        {isUser ? 'You' : 'Assistant'}
      </span>

      {/* Bubble */}
      <div
        className={cn(
          'relative max-w-[85%] rounded-2xl px-4 py-3',
          'text-sm leading-relaxed whitespace-pre-wrap break-words',
          isUser && [
            'bg-indigo-600 text-white',
            'rounded-br-md',
            'shadow-[0_2px_12px_rgba(99,102,241,0.3)]',
          ],
          isAssistant && [
            'bg-slate-700/80 text-slate-100',
            'border border-slate-600/50',
            'rounded-bl-md',
          ]
        )}
      >
        {message.content}
      </div>

      {/* Timestamp */}
      <span className="text-[10px] text-slate-600 px-1">
        {formatTime(message.timestamp)}
      </span>
    </div>
  );
}

// Typing indicator bubble for assistant thinking state
export function TypingBubble() {
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="text-[10px] font-medium text-slate-500 px-1">Assistant</span>
      <div className="bg-slate-700/80 border border-slate-600/50 rounded-2xl rounded-bl-md px-4 py-3">
        <div className="flex gap-1 items-center h-4">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="w-1.5 h-1.5 bg-slate-400 rounded-full animate-bounce"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
