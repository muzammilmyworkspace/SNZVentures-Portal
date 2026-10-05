/**
 * What staff and students call each application status.
 *
 * A submitted application is "Under review" from the moment it arrives: it is
 * waiting on us, which is all either side needs to know. `under_review` (an
 * older, never-used step) reads the same.
 */
export const REVIEW_LABEL: Record<string, string> = {
  draft: "Draft",
  submitted: "Under review",
  under_review: "Under review",
  returned: "Changes requested",
  accepted: "Ready to apply",
  applied: "Applied",
};
