// Terms of use (DECISIONS D47). DRAFT for the team to review — not legal advice.
import type { Doc } from './types';

export const TERMS: Doc = {
  draftNote:
    'Draft for the Scenic Stroll team to review. This is not legal advice and has not been checked by a lawyer.',
  updated: '20 November 2026',
  intro:
    'Scenic Stroll is a free student project in beta. By using it you agree to these terms. Please also read the privacy policy.',
  sections: [
    {
      heading: 'Use your own judgement',
      body: [
        'Routes, shade and shelter, step-free information, weather, arrival times, fares and CO₂ figures are estimates and can be wrong or out of date. Paths close, lifts break and the weather changes.',
        'Always watch where you are going, follow signs, staff instructions and traffic rules, and don’t use your phone while crossing a road. Don’t rely on Scenic Stroll in an emergency — call 999.',
      ],
    },
    {
      heading: 'Routes shared by other people',
      body: [
        'Community routes are recorded by other users and checked by the team before they are shown, but we can’t guarantee they are accurate or safe. If one is wrong, tap “Report a problem” on it.',
      ],
    },
    {
      heading: 'What you share',
      body: [
        'You keep the rights to the routes and descriptions you share, and you let us show them to other users of Scenic Stroll and use them to improve routes.',
        'Please don’t share anything offensive, illegal or personal (other people’s names, faces or contact details), and don’t try to overload or misuse the service. We may hide or remove content and limit accounts that break these rules.',
      ],
    },
    {
      heading: 'No guarantees',
      body: [
        'Scenic Stroll is provided “as is”, for free, during a beta. It may change, stop working or lose data. As far as the law allows, the team is not responsible for any loss or harm from using it.',
      ],
    },
    {
      heading: 'Map and data sources',
      body: [
        'The app uses data from the Hong Kong Government, OpenStreetMap contributors and others under their own licences — see “Data sources & credits”.',
      ],
    },
    {
      heading: 'Changes and law',
      body: [
        'We may update these terms; the date at the top shows the latest version. These terms are governed by the laws of the Hong Kong SAR.',
        'Contact: [team email — to be added before launch].',
      ],
    },
  ],
};
