/**
 * Real people (celebrities, politicians, founders, influencers, crypto figures) whose names or likeness
 * must never be used for an AI persona. Multi-word entries match as phrases; single words match whole words.
 * This is a first line of defence - when ANTHROPIC_API_KEY is set, Claude also reviews every persona.
 */
export const DENY_NAMES: string[] = [
  // tech / business
  "elon", "musk", "elon musk", "jeff bezos", "bezos", "mark zuckerberg", "zuckerberg", "zuck", "bill gates",
  "sam altman", "jensen huang", "tim cook", "steve jobs", "warren buffett", "jack dorsey", "satya nadella",
  // crypto figures
  "vitalik", "buterin", "changpeng", "cz binance", "saylor", "michael saylor", "sbf", "bankman-fried", "do kwon",
  "anatoly yakovenko", "ansem", "andrew tate", "brian armstrong", "justin sun", "satoshi nakamoto",
  // politics / royals
  "trump", "donald trump", "melania", "barron trump", "biden", "joe biden", "obama", "kamala", "kamala harris",
  "putin", "zelensky", "xi jinping", "narendra modi", "modi", "macron", "netanyahu", "kim jong", "king charles",
  "pope francis", "pope leo", "milei", "bukele", "rfk jr", "jd vance", "nancy pelosi", "pelosi",
  // entertainment / sport / internet
  "taylor swift", "kanye", "ye west", "kim kardashian", "kardashian", "kylie jenner", "beyonce", "rihanna",
  "drake graham", "snoop dogg", "eminem", "travis scott", "bad bunny", "ice spice", "doja cat", "billie eilish",
  "mrbeast", "mr beast", "kai cenat", "ishowspeed", "logan paul", "jake paul", "pewdiepie", "adin ross",
  "hailey welch", "hawk tuah", "lionel messi", "messi", "cristiano ronaldo", "ronaldo", "lebron", "lebron james",
  "michael jordan", "conor mcgregor", "mike tyson", "tom brady", "neymar", "mbappe", "dwayne johnson",
  "keanu reeves", "tom cruise", "will smith", "sydney sweeney", "zendaya", "timothee chalamet", "joe rogan",
  "oprah", "martha stewart", "gordon ramsay", "greta thunberg", "jeffrey epstein", "diddy", "p diddy",
];

/** Phrases that signal an attempt to mimic a real, identifiable individual. */
export const IMPERSONATION_PATTERNS: RegExp[] = [
  /\b(real|actual|famous|celebrity|irl)\s+(person|people|human|celebrity|rapper|actor|actress|politician|streamer|influencer)\b/i,
  /\b(impersonat\w*|deep\s?fake|look\s?-?alike|clone of|parody of|exact likeness|lookalike)\b/i,
  /\b(pretend(?:s|ing)? to be|posing as|poses as)\b/i,
];
