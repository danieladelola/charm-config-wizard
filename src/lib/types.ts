export type ChatStatus = "open" | "pending" | "closed";
export type MessageSender = "visitor" | "admin" | "system";

export interface ChatSession {
  id: string;
  widget_id: string;
  visitor_id: string;
  visitor_key: string;
  status: ChatStatus;
  domain: string | null;
  page_url: string | null;
  user_agent: string | null;
  visitor_online: boolean;
  visitor_last_seen_at: string;
  unread_for_admin: number;
  unread_for_visitor: number;
  last_message_at: string;
  created_at: string;
  country?: string | null;
  country_code?: string | null;
  city?: string | null;
  ip_address?: string | null;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  visitor_key: string;
  sender: MessageSender;
  body: string | null;
  created_at: string;
  attachment_url?: string | null;
  attachment_name?: string | null;
  attachment_type?: string | null;
  attachment_size?: number | null;
}

export interface VisitorProfile {
  id: string;
  visitor_key: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export interface WidgetSettings {
  widget_id: string;
  title: string;
  welcome_message: string;
  brand_color: string;
  button_text: string;
  offline_message: string;
  require_name: boolean;
  require_email: boolean;
  require_phone: boolean;
  allowed_domains: string[];
  notification_email: string | null;
  business_hours: Record<string, unknown>;
  updated_at: string;
}

export interface ChatWidget {
  id: string;
  public_key: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface SavedReply {
  id: string;
  shortcut: string;
  body: string;
  created_at: string;
}

export interface ChatNote {
  id: string;
  session_id: string;
  body: string;
  created_at: string;
}
