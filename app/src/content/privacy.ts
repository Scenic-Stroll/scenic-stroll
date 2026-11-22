// Privacy policy text (DECISIONS D47). DRAFT for the team to review — not legal advice.
// Every statement here must match what the app really does; if you change how data is stored,
// update this file in the same pull request.
import type { Doc } from './types';

export const PRIVACY: Doc = {
  draftNote:
    'Draft for the Scenic Stroll team to review. This is not legal advice and has not been checked by a lawyer.',
  updated: '24 November 2026',
  intro:
    'Scenic Stroll is a student project (beta) that helps you find shaded, sheltered and step-free walking routes in Hong Kong. This page explains, in plain words, what data the app uses, why, how long we keep it and how you can download or delete it. We aim to follow the Personal Data (Privacy) Ordinance (Cap. 486) and its six Data Protection Principles.',
  sections: [
    {
      heading: 'Your account',
      body: [
        'You don’t need an email address or a name. The first time you open Scenic Stroll it creates an anonymous account with a random ID, so your routes and friends stay linked to you.',
        'You can add a display name in Profile. It is only shown if you choose “Show my name on new routes”, and to friends you add.',
      ],
    },
    {
      heading: 'Your location — what, why and how long',
      body: [
        'Your device’s location is used on your device to show where you are and to plan routes from there. You can say no to location access: you can still pick a start point on the map or from the list of places.',
        'Your location only leaves your device in these cases:',
        [
          'Planning a route: the start and end points go to our server and to the route provider we use (openrouteservice, or Google Maps Platform for driving and public transport). Answers are kept for up to 10 minutes, with the points rounded to about 50 m, so the same request isn’t paid for twice.',
          'Sharing a route you recorded: only when you tap Upload. The line you walked, its checkpoints and your description are stored and, after a check by the team, shown to other users. Your raw GPS points stay on your device. Shared routes are kept until you delete them.',
          'Live location sharing: only when you turn it on, and only to the friends you choose — exact or approximate (rounded to about 200 m). Friends stop seeing it 30 minutes after your last update, when the time you chose runs out, or as soon as you tap Stop, which deletes it.',
          '“Path blocked” reports: the point you report is kept for 3 hours and shown to others without your name.',
          '“Was it sheltered as promised?” answers: counted as votes on the paths you walked, to improve the shade estimates. Who voted is never shown.',
        ],
      ],
    },
    {
      heading: 'Other data we keep',
      body: [
        [
          'Your age band (under 18 or 18 and over), your consent and your two optional choices (research, government sharing — both off unless you tick them), and your reading style.',
          'Knowledge pins you collect and read (adults): which pin and when. Under 18: this stays on your device; the server only counts that a pin was unlocked on a day, without saying by whom.',
          'Points (adults): how far you walked on each day while recording (in metres — not the route itself), and the points it earned. Under 18s don’t earn points and nothing is stored for them.',
          'Place searches: the text you type goes to our server and to openrouteservice to find matching places. We don’t store it.',
          'Feedback you send and routes you report: kept so the team can act on them; nobody else can read them.',
          'Friends: the friend code you share and the friendships you accept, until you remove a friend.',
          'Your IP address: used for about an hour to stop abuse (limits on how many requests one person can make). Our hosting providers also keep short technical logs.',
        ],
      ],
    },
    {
      heading: 'Visit counts and error reports (website)',
      body: [
        'On the website we count visits with Umami, which uses no cookies and doesn’t follow you to other sites. It counts pages opened and three events — a route planned, a route recorded, feedback sent — and never the places you searched for. If your browser sends “Do Not Track”, nothing is counted.',
        'If the website crashes, an error report goes to Sentry so we can fix it. Before it is sent we remove your IP address, any map coordinates and anything typed in addresses.',
      ],
    },
    {
      heading: 'If you are under 18',
      body: [
        'Safety mode is always on for you: no route recording, no friends or location sharing, no shop offers and no points (you still get badges). The pins you collect stay on your device. You can still plan routes and read pins.',
      ],
    },
    {
      heading: 'Who processes the data for us',
      body: [
        [
          'Supabase — our database and server functions. Its servers may be outside Hong Kong.',
          'Expo (EAS Hosting) — serves the website.',
          'OpenFreeMap — map pictures on the website (your browser asks it for the area of the map you’re looking at).',
          'openrouteservice and Google Maps Platform — calculate routes from the start and end points you choose.',
          'Umami and Sentry — visit counts and error reports, as described above.',
        ],
        'We don’t sell your data and we don’t use it for advertising.',
      ],
    },
    {
      heading: 'Download or delete your data',
      body: [
        'Profile → Download my data saves a file with everything stored on your device and your profile.',
        'Profile → Delete my data deletes your shared routes and descriptions and your pin collection, removes your display name, and clears everything stored by the app on your device (on the website: in this browser).',
        'It does not remove a live location share (use Profile → Location sharing → Stop), your friendships (remove friends in Friends), your points history or reports and feedback you sent. To have those or your whole account deleted, or to ask for a copy or a correction of your data, contact the team.',
      ],
    },
    {
      heading: 'Estimates, not promises',
      body: [
        'Shade, shelter, weather, fares, travel times and CO₂ figures are estimates from public data and models. They can be wrong — always follow signs, staff and traffic rules.',
      ],
    },
    {
      heading: 'Contact',
      body: [
        'Questions or requests about your data: [team email — to be added before launch]. We will reply within 40 days, as the Ordinance requires for data access requests.',
      ],
    },
  ],
};
