module.exports = [
  {
    ignores: ["generated/**", "node_modules/**", ".postgres/**", "coverage/**"],
  },
  {
    files: ["**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "commonjs",
    },
    rules: {},
  },
];
