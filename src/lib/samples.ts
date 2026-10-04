/** Clearly-labelled concept characters shown when the registry is empty. Not real tokens. */
export interface SampleCharacter {
  name: string;
  symbol: string;
  sentence: string;
  seed: number;
  palette: string[];
  graduated: boolean;
  progress: number;
}

export const SAMPLE_CHARACTERS: SampleCharacter[] = [
  { name: "Marlo", symbol: "MARLO", sentence: "a moth who is obsessed with ring lights and late-night diners", seed: 7, palette: ["#ff6a3d", "#ffb547", "#22163d"], graduated: true, progress: 100 },
  { name: "Bisou", symbol: "BISOU", sentence: "a pigeon who runs a tiny bakery and judges everyone's croissants", seed: 21, palette: ["#ff4f9a", "#ffd166", "#251a3a"], graduated: false, progress: 64 },
  { name: "Tank", symbol: "TANK", sentence: "a hamster training for a boxing title he will never get", seed: 33, palette: ["#4cf2c2", "#c6ff3d", "#14213d"], graduated: false, progress: 38 },
  { name: "Juno", symbol: "JUNO", sentence: "a cactus DJ who only plays desert sunrise sets", seed: 48, palette: ["#b49cff", "#3df5ff", "#121a2f"], graduated: true, progress: 100 },
  { name: "Pemberton", symbol: "PEMB", sentence: "a penguin travel vlogger who is cold in every country", seed: 59, palette: ["#7fc8ff", "#fff6ea", "#1b2440"], graduated: false, progress: 81 },
  { name: "Ziggy", symbol: "ZIGGY", sentence: "a raccoon street-food critic with impeccable manners", seed: 72, palette: ["#ffcf3d", "#ff6b6b", "#1f2a24"], graduated: false, progress: 12 },
];

export const SAMPLE_POSTS = [
  { who: 0, platform: "x" as const, caption: "3am diner. the neon sign flickers in morse code and I am 80% sure it's flirting with me. (AI-generated character)", scene: "night out", ago: "sample" },
  { who: 3, platform: "tiktok" as const, caption: "sunrise set from the dunes. the coyotes requested the remix. #AIgenerated", scene: "stage", ago: "sample" },
  { who: 1, platform: "instagram" as const, caption: "rated 14 croissants today. one made me emotional. #AIgenerated", scene: "street walk", ago: "sample" },
  { who: 2, platform: "x" as const, caption: "skipping rope for 4 minutes straight. new personal record. the wheel is jealous. (AI-generated character)", scene: "gym", ago: "sample" },
  { who: 4, platform: "instagram" as const, caption: "gate B12. wearing three scarves. it is 31 degrees outside. #AIgenerated", scene: "airport", ago: "sample" },
  { who: 5, platform: "tiktok" as const, caption: "trying every dumpling on this street so you don't have to. please bring napkins. #AIgenerated", scene: "road trip", ago: "sample" },
];

export const SCENES = [
  { key: "street walk", label: "Street walk", emoji: "🚶" },
  { key: "fight night", label: "Fight night", emoji: "🥊" },
  { key: "face cam", label: "Face cam", emoji: "🤳" },
  { key: "stage", label: "Stage", emoji: "🎤" },
  { key: "dance", label: "Dance", emoji: "🪩" },
  { key: "airport", label: "Airport", emoji: "✈️" },
  { key: "road trip", label: "Road trip", emoji: "🚐" },
  { key: "gym", label: "Gym", emoji: "🏋️" },
  { key: "karaoke", label: "Karaoke booth", emoji: "🎶" },
  { key: "laundromat", label: "3am laundromat", emoji: "🫧" },
  { key: "rooftop", label: "Rooftop golden hour", emoji: "🌇" },
  { key: "ramen", label: "Ramen bar", emoji: "🍜" },
];
