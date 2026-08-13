export interface ChatGPTMessage {
  id: string;
  author: {
    role: 'user' | 'assistant' | 'system';
    name?: string;
    metadata?: any;
  };
  content: {
    content_type: 'text';
    parts: string[];
  };
  metadata?: any;
}

export interface ChatPayload {
  action: 'next';
  messages: ChatGPTMessage[];
  parent_message_id: string;
  model: string;
  conversation_id?: string;
  timezone_offset_min?: number;
  history_and_training_disabled?: boolean;
  force_paragen?: boolean;
  force_paragen_model_slug?: string;
  suggestions?: string[];
  conversation_mode?: { kind: string; plugin_ids?: any };
  [key: string]: any;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenAIRequest {
  model?: string;
  messages: OpenAIMessage[];
  stream?: boolean;
  temperature?: number;
  max_tokens?: number;
}

export interface ChatGPTResponse {
  message?: {
    id: string;
    author: { role: string };
    content: { parts: string[]; content_type?: string };
    create_time: number;
    end_time: number | null;
  };
  conversation_id: string;
  error?: string;
}
