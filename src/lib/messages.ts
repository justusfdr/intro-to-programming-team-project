// Every message the user can see after an action, in one place.
// Texts in the "ontology" block are copied word for word from docs/ontology.md; do not reword them.
// Tests compare against the literal text, so a change here makes them fail on purpose.

export const MESSAGES = {
  // ontology, section 5 (accounts)
  emailTaken: "This email is already registered",
  passwordTooShort: "Password needs at least 8 characters",
  linkExpired: "This link has expired. Ask for a new one",
  resendSent: "If this email needs confirming, we sent a link",
  resendTooSoon: "Please wait a minute before asking again",
  wrongCredentials: "Email or password is wrong",
  unconfirmed: "Confirm your email first. We sent you a link",
  resetRequested: "If this email is registered, we sent a link",
  // ontology, section 5 (events) and R3, R4
  titleLength: "Title must be 1 to 100 characters",
  endAfterStart: "End must be after start",
  atMost24Hours: "An event can last at most 24 hours",
  notStarted: "You can mark an event done once it has started",
  changedElsewhere: "Changed on another device. Reload to see the latest version",
  notFound: "Not found",
  // ontology, section 7 (when a service is down)
  databaseDown: "Your data cannot be loaded right now.",
  emailDown: "We could not send the email. Try again later",

  // Not in the ontology (our wording, reported to the advisor).
  signUpDone: "We sent you a link. Open it to confirm your email.",
  passwordSaved: "Your new password is saved. Sign in with it.",
  eventSaved: "Event saved.",
  invalidEmail: "Enter a valid email address",
  passwordTooLong: "Password can be at most 72 characters",
  signInRequired: "Please sign in.",
  authDown: "Signing in is not available right now. Try again later",
  forbidden: "This request came from another site and was blocked.",
  tooLarge: "The request is too large.",
  badRequest: "Invalid request.",
  unexpected: "Something went wrong. Nothing was changed.",
} as const;
