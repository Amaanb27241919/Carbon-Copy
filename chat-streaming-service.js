// Chat Streaming Service — Real-time AI Responses
// Integrates with rawclaw-chat pattern for streaming responses

const fetch = require('node-fetch');

class ChatStreamingService {
  constructor(modelRouterUrl = 'http://localhost:3004') {
    this.modelRouterUrl = modelRouterUrl;
  }

  // Stream chat response from any provider
  async streamChat(messages, provider = 'claude', model = 'claude-sonnet-4-6', onChunk) {
    const payload = {
      messages,
      provider,
      model,
      stream: true,
    };

    try {
      const response = await fetch(`${this.modelRouterUrl}/api/chat/stream`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Model router error: ${response.status}`);
      }

      // Handle streaming response
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');

        for (let i = 0; i < lines.length - 1; i++) {
          const line = lines[i];
          if (line.startsWith('data: ')) {
            try {
              const json = JSON.parse(line.slice(6));
              if (json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content) {
                onChunk(json.choices[0].delta.content);
              }
            } catch (e) {
              // Skip invalid JSON
            }
          }
        }

        buffer = lines[lines.length - 1];
      }

      return buffer;
    } catch (e) {
      console.error('[ChatStreaming] Error:', e);
      throw e;
    }
  }

  // Non-streaming chat (for comparison)
  async chat(messages, provider = 'claude', model = 'claude-sonnet-4-6') {
    const payload = { messages, provider, model, stream: false };

    const response = await fetch(`${this.modelRouterUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Chat error: ${response.status}`);
    }

    return await response.json();
  }
}

module.exports = ChatStreamingService;
