// Jest auto-uses this mock for @vercel/analytics (its ESM build isn't transformed in node_modules).
module.exports = { track: () => {} };
