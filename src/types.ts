export interface JournalEntry {
  id?: string;
  title: string;
  content: string;
  mood: string;
  tags: string[];
  createdAt: any;
  updatedAt: any;
  userId: string;
}

export interface MoodLog {
  id?: string;
  mood: number;
  emoji: string;
  note: string;
  createdAt: any;
  userId: string;
}

export interface Task {
  id?: string;
  title: string;
  priority: 'low' | 'medium' | 'high';
  deadline: any;
  notes?: string;
  category?: string;
  completed: boolean;
  createdAt: any;
  userId: string;
}

export interface CalendarEvent {
  id?: string;
  title: string;
  description?: string;
  startTime: any;
  endTime: any;
  category?: string;
  repeat?: 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
  repeatDays?: number[];
  createdAt: any;
  userId: string;
}

export interface UserPreference {
  id?: string;
  theme: 'light' | 'dark';
  colorTheme: string;
  notificationsEnabled: boolean;
  userId: string;
}

export interface SavedInspiration {
  id?: string;
  quote: string;
  author: string;
  savedAt: any;
  userId: string;
}

export interface Memory {
  id?: string;
  content: string;
  createdAt: any;
  userId: string;
}
