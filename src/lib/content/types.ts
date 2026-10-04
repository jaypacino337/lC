export interface CharacterSheet {
  name: string;
  handle: string;
  tagline: string;
  look: string;
  voice: string;
  backstory: string;
  postingStyle: string;
  recurringLocations: string[];
  catchphrases: string[];
  palette: string[]; // hex colors used for placeholder portraits
}

export interface PlannedPostDraft {
  caption: string;
  mediaPrompt: string;
  mediaType: "image" | "video";
  location: string;
}
