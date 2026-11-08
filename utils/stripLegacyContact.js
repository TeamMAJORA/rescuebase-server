// Older lost & found reports saved the reporter's phone inside the
// description as " · Contact: +63 …". Remove it before showing it publicly.
const LEGACY_CONTACT_IN_DESCRIPTION = /\s*·\s*Contact:[^·]*?(?=\s*·|$)/g;

module.exports = function stripLegacyContact(description) {
    return String(description || "").replace(LEGACY_CONTACT_IN_DESCRIPTION, "");
};
