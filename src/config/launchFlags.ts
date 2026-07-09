// Launch switches. A flag here gates EVERY entry point for the feature —
// flip it in one place only.

// Commercial posting: gates the wizard PathPicker cards and the wizard
// type-change dropdown. (The legacy /post-commercial page always redirects
// to the wizard now — see PostCommercialListing.tsx.) Flip to true at
// commercial launch.
export const COMMERCIAL_POSTING_LIVE = true;
