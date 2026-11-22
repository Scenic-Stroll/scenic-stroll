// MADE-UP data for the preview mock-ups (D57). Not real pins, people or shops.
export const FAKE_BOARDS = [
  {
    id: 'street-names',
    title: 'Street names of Kowloon Tong',
    blurb: 'Why the roads here are named after English counties.',
    pins: ['Kent Road', 'Cumberland Road', 'Devon Road', 'Somerset Road', 'Dorset Crescent'],
    collected: 2,
  },
  {
    id: 'keeping-cool',
    title: 'Keeping cool in the heat',
    blurb: 'Covered walkways, footbridges and shady corners.',
    pins: ['Footbridge roof', 'Mall passage', 'Tree-lined path', 'Station concourse'],
    collected: 0,
  },
  {
    id: 'old-boundary',
    title: 'The old Kowloon boundary',
    blurb: 'Where Hong Kong once ended.',
    pins: ['Boundary Street', 'Boundary stone', 'Lion Rock view'],
    collected: 1,
  },
] as const;

export const FAKE_STUDENTS = [
  { name: 'Student A', done: 4 },
  { name: 'Student B', done: 2 },
  { name: 'Student C', done: 5 },
] as const;

export const FAKE_QUESTION = {
  prompt: 'The roads in this area are named after…',
  options: ['English counties', 'Famous ships', 'Hong Kong governors'],
  answer: 'English counties',
} as const;

export const FAKE_OFFER = {
  shop: 'Example Café (made up)',
  offer: 'A free iced lemon tea with any meal',
  unlock: 'Unlocked at Level 3 — offers are never bought or paid for with points',
  code: 'PREVIEW-4821',
} as const;
