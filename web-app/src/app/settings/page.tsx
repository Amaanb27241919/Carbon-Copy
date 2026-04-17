'use client';

import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import {
  LogOut,
  Eye,
  EyeOff,
  Save,
  ChevronRight,
  Zap,
  Info,
  Loader2,
  Check,
} from 'lucide-react';
import { useAuthStore } from '@/stores/auth';
import { settingsApi } from '@/lib/api';
import { cn, providerEmoji, getErrorMessage } from '@/lib/utils';
import { toast } from '@/components/Toast';
import { PageHeader } from '@/components/PageHeader';

type Provider = 'ollama' | 'openai' | 'claude' | 'huggingface';

const PROVIDERS: Array<{
  id: Provider;
  label: string;
  description: string;
  color: string;
}> = [
  {
    id: 'ollama',
    label: 'Ollama',
    description: 'Local open-source models',
    color: 'text-green-400',
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT-4, GPT-4o, etc.',
    color: 'text-blue-400',
  },
  {
    id: 'claude',
    label: 'Claude',
    description: 'Anthropic Claude models',
    color: 'text-purple-400',
  },
  {
    id: 'huggingface',
    label: 'HuggingFace',
    description: 'Open-source hub models',
    color: 'text-amber-400',
  },
];

function ApiKeyInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [show, setShow] = useState(false);

  return (
    <div>
      <label className="label">{label}</label>
      <div className="relative">
        <input
          type={show ? 'text' : 'password'}
          className="input pr-12 font-mono text-sm"
          placeholder={placeholder ?? 'sk-...'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
        />
        <button
          type="button"
          onClick={() => setShow((v) => !v)}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors p-1"
          aria-label={show ? 'Hide API key' : 'Show API key'}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold text-slate-500 uppercase tracking-widest mb-3 px-1">
        {title}
      </h2>
      <div className="card space-y-4">{children}</div>
    </section>
  );
}

export default function SettingsPage() {
  const router = useRouter();
  const { logout, user } = useAuthStore();

  const [activeProvider, setActiveProvider] = useState<Provider>('ollama');
  const [defaultModel, setDefaultModel] = useState('');
  const [apiKeys, setApiKeys] = useState({
    openai: '',
    claude: '',
    huggingface: '',
  });
  const [saved, setSaved] = useState(false);

  const saveMutation = useMutation({
    mutationFn: () =>
      settingsApi.updateSettings({
        activeProvider,
        defaultModel,
        openaiApiKey: apiKeys.openai,
        claudeApiKey: apiKeys.claude,
        huggingfaceApiKey: apiKeys.huggingface,
      }),
    onSuccess: () => {
      toast('success', 'Settings saved');
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    },
    onError: (err) => toast('error', getErrorMessage(err)),
  });

  const handleLogout = () => {
    logout();
    router.replace('/login');
    toast('info', 'Signed out successfully');
  };

  return (
    <div className="min-h-screen pb-nav">
      <PageHeader
        title="Settings"
        subtitle={user ? `Signed in as ${user.username}` : undefined}
        actions={
          <button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            className={cn(
              'flex items-center gap-1.5 text-xs font-semibold py-2 px-3 rounded-xl transition-all duration-150 min-touch',
              saved
                ? 'bg-green-900/40 text-green-400 border border-green-800/50'
                : 'btn-primary'
            )}
          >
            {saveMutation.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : saved ? (
              <Check className="w-3.5 h-3.5" />
            ) : (
              <Save className="w-3.5 h-3.5" />
            )}
            {saved ? 'Saved' : 'Save'}
          </button>
        }
      />

      <div className="px-4 py-4 space-y-5 page-enter">

        {/* AI Provider */}
        <Section title="AI Provider">
          <p className="text-xs text-slate-500 -mt-1">
            Select the default AI provider for chat and completions.
          </p>
          <div className="space-y-2">
            {PROVIDERS.map((provider) => (
              <button
                key={provider.id}
                onClick={() => setActiveProvider(provider.id)}
                className={cn(
                  'w-full flex items-center gap-3 p-3 rounded-xl border transition-all duration-150',
                  activeProvider === provider.id
                    ? 'bg-indigo-950/40 border-indigo-500/50'
                    : 'bg-slate-800/40 border-slate-700/40 hover:border-slate-600'
                )}
              >
                <span className="text-xl" aria-hidden>
                  {providerEmoji[provider.id]}
                </span>
                <div className="flex-1 text-left">
                  <p className={cn('text-sm font-semibold', provider.color)}>
                    {provider.label}
                  </p>
                  <p className="text-xs text-slate-500">{provider.description}</p>
                </div>
                {activeProvider === provider.id && (
                  <Check className="w-4 h-4 text-indigo-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </Section>

        {/* API Keys */}
        <Section title="API Keys">
          <p className="text-xs text-slate-500 -mt-1">
            Keys are stored in the gateway and never sent to the client.
          </p>
          <ApiKeyInput
            label="OpenAI API Key"
            value={apiKeys.openai}
            onChange={(v) => setApiKeys((k) => ({ ...k, openai: v }))}
            placeholder="sk-..."
          />
          <ApiKeyInput
            label="Anthropic (Claude) API Key"
            value={apiKeys.claude}
            onChange={(v) => setApiKeys((k) => ({ ...k, claude: v }))}
            placeholder="sk-ant-..."
          />
          <ApiKeyInput
            label="HuggingFace API Key"
            value={apiKeys.huggingface}
            onChange={(v) => setApiKeys((k) => ({ ...k, huggingface: v }))}
            placeholder="hf_..."
          />
        </Section>

        {/* Model defaults */}
        <Section title="Model Defaults">
          <div>
            <label className="label" htmlFor="default-model">
              Default Model
            </label>
            <input
              id="default-model"
              type="text"
              className="input font-mono"
              placeholder="llama3.2, gpt-4o, claude-3-5-sonnet..."
              value={defaultModel}
              onChange={(e) => setDefaultModel(e.target.value)}
              autoCapitalize="none"
              spellCheck={false}
            />
            <p className="text-xs text-slate-600 mt-1.5 px-1">
              Used when no model is explicitly selected
            </p>
          </div>
        </Section>

        {/* App Info */}
        <Section title="About">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Zap className="w-4 h-4 text-indigo-400" />
                <span className="text-sm text-slate-300">Carbon Core</span>
              </div>
              <span className="text-xs text-slate-500">v1.0.0</span>
            </div>

            <div className="w-full h-px bg-slate-700/40" />

            {[
              { label: 'Gateway', value: 'http://gateway:3000' },
              { label: 'Data Server', value: 'http://data-server:3002' },
              { label: 'VM Manager', value: 'http://vm-manager:3003' },
              { label: 'Model Router', value: 'http://model-router:3004' },
              { label: 'OpenClaw', value: 'http://openclaw:8001' },
              { label: 'NemoClaw', value: 'http://nemoclaw:8002' },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between gap-2">
                <span className="text-xs text-slate-500">{label}</span>
                <span className="text-xs text-slate-600 font-mono truncate max-w-[60%] text-right">
                  {value}
                </span>
              </div>
            ))}

            <div className="w-full h-px bg-slate-700/40" />

            <button
              onClick={() => toast('info', 'Documentation coming soon')}
              className="w-full flex items-center justify-between text-sm text-slate-400 hover:text-slate-200 transition-colors py-1"
            >
              <div className="flex items-center gap-2">
                <Info className="w-4 h-4" />
                Documentation
              </div>
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </Section>

        {/* Danger Zone */}
        <Section title="Account">
          <div className="space-y-3">
            {user && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Signed in as</span>
                <span className="text-slate-200 font-medium">{user.username}</span>
              </div>
            )}
            {user?.role === 'admin' && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Role</span>
                <span className="badge bg-indigo-900/40 text-indigo-400 border border-indigo-800/50">
                  Admin
                </span>
              </div>
            )}
            <div className="w-full h-px bg-slate-700/40" />
            <button
              onClick={handleLogout}
              className="btn-danger w-full flex items-center justify-center gap-2"
            >
              <LogOut className="w-4 h-4" />
              Sign Out
            </button>
          </div>
        </Section>

        {/* Bottom padding for safety */}
        <div className="h-4" />
      </div>
    </div>
  );
}
