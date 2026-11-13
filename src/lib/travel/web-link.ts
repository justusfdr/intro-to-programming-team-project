// A location that is a web link (an online meeting) has no travel time (R27). Shared by the server and the
// calendar, which asks only for events that can have one.
export function isWebLink(location: string): boolean {
  return /^(https?:\/\/|www\.)/i.test(location.trim()) || /\S+:\/\/\S+/.test(location);
}

/** Whether an event can have a travel time at all: timed, with a location that is not a web link (R27, R29). */
export function canTravel(event: { allDay: boolean; location: string | null }): boolean {
  const location = event.location?.trim() ?? "";
  return !event.allDay && location !== "" && !isWebLink(location);
}
