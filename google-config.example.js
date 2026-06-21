// Template for public/google-config.js, which is gitignored so credentials are never committed.
//   Local use: copy this file to public/google-config.js and fill in the values.
//   GitHub Pages: the apiKey is injected at build time from the GOOGLE_API_KEY Actions secret.
window.GOOGLE_CONFIG = {
  clientId: "556658401647-soqsutprr74h5723vdcm03sfaikus68a.apps.googleusercontent.com",
  apiKey: "",   // Google Picker browser API key (referrer-restricted)
  appId: ""     // Cloud project number; derived from clientId when left blank
};
