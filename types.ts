
export enum Role {
  USER = 'user',
  MODEL = 'model'
}

export type VoiceStyle = 'calm' | 'narrative' | 'excited' | 'teacher' | 'storyteller';
export type AvatarEmotion = 'neutral' | 'happy' | 'thoughtful' | 'serious' | 'surprised';
export type AvatarEnergy = 'low' | 'medium' | 'high';

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface IndiResponse {
  reply_text: string;
  short_title: string;
  voice_style: VoiceStyle;
  avatar_emotion: AvatarEmotion;
  avatar_energy: AvatarEnergy;
  reasoning_notes: string;
  groundingSources?: GroundingSource[];
  memory_to_save?: string[]; 
  diagram_code?: string;
  related_questions?: string[]; // New field for suggested follow-up questions
}

export interface Message {
  id: string;
  role: Role;
  content: string; // The raw text content
  parsedResponse?: IndiResponse; // If model, and successfully parsed
  image?: string; // Base64 or URL for user images
  timestamp: number;
}