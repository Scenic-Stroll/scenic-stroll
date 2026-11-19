// The shape of a text page (privacy policy, terms): headed sections of paragraphs and lists.
export type DocSection = {
  heading: string;
  /** A string is a paragraph; an array of strings is a bulleted list. */
  body: (string | string[])[];
};

export type Doc = {
  /** Shown as a banner when set, e.g. "Draft for team review". */
  draftNote?: string;
  updated: string;
  intro?: string;
  sections: DocSection[];
};
