'use client';

import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Cpu,
  Send,
  Download,
  X,
  Loader2,
  ChevronDown,
  Zap,
  MessageSquare,
} from 'lucide-react';
import { modelsApi, AIModel, ChatMessage } from '@/lib/api';
import { ChatBubble, TypingBubble } from '@/components/ChatBubble';
import { PageHeader } from '@/components/PageHeader';
import { cn, providerColors, providerEmoji, getErrorMessage } from '@/lib/utils';
import { toast } from '@/components/Toast';

function ProviderBadge({ provider }: { provider: AIModel['provider'] }) {
  const colors = providerColors[provider];
  return (
    <span className={cn('badge border', colors.bg, colors.text, colors.border)}>
      {providerEmoji[provider]} {provider}
    </span>
  );
}

function ModelCard({
  model,
  isSelected,
  onSelect,
}: {
  model: AIModel;
  isSelected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'w-full card text-left transition-all duration-150',
        isSelected
          ? 'border-indigo-500/60 bg-indigo-950/30 shadow-[0_0_0_1px_rgba(99,102,241,0.2)]'
          : 'hover:border-slate-600'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold text-slate-100">{model.name}</span>
            {isSelected && (
              <span className="badge bg-indigo-900/60 text-indigo-300 border-indigo-700/50">
                Selected
              </span>
            )}
          </div>
          <ProviderBadge provider={model.provider} />
        </div>
        <div className="flex flex-col items-end gap-1">
          <span
            className={cn(
              'w-2 h-2 rounded-full flex-shrink-0 mt-1',
              model.available ? 'bg-green-500' : 'bg-slate-600'
            )}
          />
          {model.size && (
            <span className="text-[10px] text-slate-600">{model.size}</span>
          )}
        </div>
      </div>
    </button>
  );
}

function PullModelModal({
  onClose,
  onPull,
}: {
  onClose: () => void;
  onPull: (name: string) => void;
}) {
  const [modelName, setModelName] = useState('');

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div className="w-full max-w-lg bg-slate-800 border border-slate-700 rounded-t-3xl p-6 space-y-4 animate-slide-up">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-slate-100">Pull Ollama Model</h2>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 p-1" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>
        <p className="text-sm text-slate-500">
          Enter an Ollama model name to pull from the registry.
        </p>
        <div>
          <label className="label" htmlFor="pull-model-name">
            Model Name
          </label>
          <input
            id="pull-model-name"
            type="text"
            className="input font-mono"
            placeholder="llama3.2, mistral, phi3..."
            value={modelName}
            onChange={(e) => setModelName(e.target.value)}
            autoCapitalize="none"
            spellCheck={false}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter' && modelName.trim()) {
                onPull(modelName.trim());
              }
            }}
          />
        </div>
        <div className="flex gap-3 pt-1">
          <button onClick={onClose} className="btn-secondary flex-1">
            Cancel
          </button>
          <button
            onClick={() => modelName.trim() && onPull(modelName.trim())}
            disabled={!modelName.trim()}
            className="btn-primary flex-1 flex items-center justify-center gap-2"
          >
            <Download className="w-4 h-4" />
            Pull
          </button>
        </div>
        {/* Safe area padding for bottom sheet */}
        <div style={{ height: 'env(safe-area-inset-bottom, 0px)' }} />
      </div>
    </div>
  );
}

export default function ModelsPage() {
  const [selectedModel, setSelectedModel] = useState<AIModel | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [showPullModal, setShowPullModal] = useState(false);
  const [activeTab, setActiveTab] = useState<'models' | 'chat'>('models');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: models = [], isLoading, refetch } = useQuery<AIModel[]>({
    queryKey: ['models'],
    queryFn: modelsApi.list,
    staleTime: 60_000,
  });

  const pullMutation = useMutation({
    mutationFn: modelsApi.pull,
    onSuccess: () => {
      toast('success', 'Model pull started — check back soon');
      setShowPullModal(false);
      setTimeout(() => refetch(), 3000);
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  const chatMutation = useMutation({
    mutationFn: modelsApi.chat,
    onSuccess: (data) => {
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: data.response,
          timestamp: new Date(),
        },
      ]);
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, chatMutation.isPending]);

  const handleSend = () => {
    const trimmed = input.trim();
    if (!trimmed || !selectedModel || chatMutation.isPending) return;

    const userMsg: ChatMessage = {
      role: 'user',
      content: trimmed,
      timestamp: new Date(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');

    chatMutation.mutate({
      model: selectedModel.id,
      message: trimmed,
      history: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  };

  const availableModels = models.filter((m) => m.available);
  const unavailableModels = models.filter((m) => !m.available);

  return (
    <div className="min-h-screen pb-nav flex flex-col">
      <PageHeader
        title="Models"
        subtitle={`${models.length} models available`}
        actions={
          <button
            onClick={() => setShowPullModal(true)}
            className="btn-secondary flex items-center gap-1.5 text-xs py-2 px-3"
          >
            <Download className="w-3.5 h-3.5" />
            Pull
          </button>
        }
      />

      {/* Tab switcher */}
      <div className="flex gap-2 mx-4 mt-4 bg-slate-800/60 rounded-xl p-1">
        <button
          onClick={() => setActiveTab('models')}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150',
            activeTab === 'models'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-300'
          )}
        >
          <Cpu className="w-3.5 h-3.5" />
          Models
        </button>
        <button
          onClick={() => {
            setActiveTab('chat');
            if (!selectedModel && models.length > 0) {
              setSelectedModel(models[0]);
            }
          }}
          className={cn(
            'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-all duration-150',
            activeTab === 'chat'
              ? 'bg-indigo-600 text-white'
              : 'text-slate-400 hover:text-slate-300'
          )}
        >
          <MessageSquare className="w-3.5 h-3.5" />
          Chat
        </button>
      </div>

      {/* Models Tab */}
      {activeTab === 'models' && (
        <div className="flex-1 overflow-y-auto px-4 py-4 space-y-5 page-enter">
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="card space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="skeleton h-4 w-28 rounded" />
                    <div className="skeleton h-2 w-2 rounded-full" />
                  </div>
                  <div className="skeleton h-5 w-16 rounded-md" />
                </div>
              ))}
            </div>
          ) : models.length === 0 ? (
            <div className="card flex flex-col items-center justify-center py-12 text-center gap-3">
              <Zap className="w-10 h-10 text-slate-600" />
              <p className="text-sm text-slate-400 font-medium">No models found</p>
              <p className="text-xs text-slate-600">Pull an Ollama model to get started</p>
              <button onClick={() => setShowPullModal(true)} className="btn-primary text-xs mt-2 flex items-center gap-1.5">
                <Download className="w-3.5 h-3.5" />
                Pull Model
              </button>
            </div>
          ) : (
            <>
              {availableModels.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
                    Available ({availableModels.length})
                  </h2>
                  <div className="space-y-2">
                    {availableModels.map((model) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        isSelected={selectedModel?.id === model.id}
                        onSelect={() => {
                          setSelectedModel(model);
                          setActiveTab('chat');
                        }}
                      />
                    ))}
                  </div>
                </section>
              )}

              {unavailableModels.length > 0 && (
                <section>
                  <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
                    Unavailable ({unavailableModels.length})
                  </h2>
                  <div className="space-y-2 opacity-60">
                    {unavailableModels.map((model) => (
                      <ModelCard
                        key={model.id}
                        model={model}
                        isSelected={false}
                        onSelect={() => toast('warning', `${model.name} is not currently available`)}
                      />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}
        </div>
      )}

      {/* Chat Tab */}
      {activeTab === 'chat' && (
        <div className="flex-1 flex flex-col overflow-hidden page-enter">
          {/* Model selector */}
          <div className="px-4 pt-3 pb-2">
            <div className="relative">
              <select
                value={selectedModel?.id ?? ''}
                onChange={(e) => {
                  const model = models.find((m) => m.id === e.target.value);
                  if (model) setSelectedModel(model);
                }}
                className="input appearance-none pr-10 text-sm"
                aria-label="Select model"
              >
                <option value="">-- Select a model --</option>
                {models.filter((m) => m.available).map((m) => (
                  <option key={m.id} value={m.id}>
                    {providerEmoji[m.provider]} {m.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Messages */}
          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
            {messages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-3 py-12">
                <MessageSquare className="w-10 h-10 text-slate-700" />
                <p className="text-sm text-slate-500 font-medium">Start a conversation</p>
                <p className="text-xs text-slate-600">
                  {selectedModel
                    ? `Chatting with ${selectedModel.name}`
                    : 'Select a model above to begin'}
                </p>
              </div>
            ) : (
              messages.map((msg, i) => <ChatBubble key={i} message={msg} />)
            )}
            {chatMutation.isPending && <TypingBubble />}
            <div ref={messagesEndRef} />
          </div>

          {/* Input */}
          <div className="px-4 pb-2 pt-2 border-t border-slate-800/60">
            <div className="flex items-end gap-2">
              <div className="flex-1">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSend();
                    }
                  }}
                  placeholder={
                    selectedModel
                      ? `Message ${selectedModel.name}...`
                      : 'Select a model first'
                  }
                  disabled={!selectedModel || chatMutation.isPending}
                  rows={1}
                  className={cn(
                    'input resize-none min-h-[44px] max-h-32',
                    'scrollbar-thin'
                  )}
                  style={{ height: 'auto' }}
                  onInput={(e) => {
                    const target = e.target as HTMLTextAreaElement;
                    target.style.height = 'auto';
                    target.style.height = `${Math.min(target.scrollHeight, 128)}px`;
                  }}
                />
              </div>
              <button
                onClick={handleSend}
                disabled={!input.trim() || !selectedModel || chatMutation.isPending}
                className="btn-primary p-3 min-touch flex-shrink-0"
                aria-label="Send message"
              >
                {chatMutation.isPending ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Pull Modal */}
      {showPullModal && (
        <PullModelModal
          onClose={() => setShowPullModal(false)}
          onPull={(name) => pullMutation.mutate(name)}
        />
      )}
    </div>
  );
}
