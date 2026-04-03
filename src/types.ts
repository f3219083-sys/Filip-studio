export interface Slide {
  title: string;
  content: string[];
  imagePrompt?: string;
  imageUrl?: string;
  imageWidth?: number;
  imageHeight?: number;
}

export type PresentationTheme = 'Modern' | 'Classic' | 'Vibrant' | 'Dark' | 'Professional' | 'Creative' | 'Minimalist' | 'Corporate' | 'Green' | 'Blue';

export interface PresentationRequest {
  topic: string;
  slideCount: number;
  language: 'English' | 'Greek';
  includeImages: boolean;
  theme: PresentationTheme;
}
