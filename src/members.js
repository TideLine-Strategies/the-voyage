// The only people who can sign in to The Voyage. Add someone here, deploy, then run
// scripts/make-invites.mjs for their email. Removing someone ends their access on the next request.
//   role "edit": full access, can own opps and tasks.
//   role "view": read-only. Can browse everything and ask Muninn, but cannot change records or post in team chat.
// IDs are short, unique, and permanent: records store them as owners and authors.
export const MEMBERS = [
  { id: "CK", name: "Cody", email: "c.knudsen@tidelinestrats.com", role: "edit" },
  { id: "QS", name: "Quan", email: "q.stewart@tidelinestrats.com", role: "edit" },
];
