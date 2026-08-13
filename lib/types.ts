export interface ChatGPTMessage {
  id: string;
  author: { role: 'user' | 'assistant' | 'system'; name?: string; metadata: Record<string, any> };
  content: { content_type: 'text'; parts: string[]; [k: string]: any };
  metadata?: Record<string, any>;
  recipient?: string | null;
  [k: string]: any;
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
  force_nulligen?: boolean;
  suggestions?: any[];
  conversation_mode?: { kind: string; [k: string]: any };
  arkose_token?: string | null;
  arkose_token_data?: any;
  websocket_request_id?: string;
  plugin_ids?: any[] | null;
  persona?: string;
  reasoning_effort?: string | null;
  supported_encodings?: string[];
  supports_buffering?: boolean;
  [k: string]: any;
}

export interface OpenAIMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}
