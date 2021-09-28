module.exports = {
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  plugins: ["prettier"],
  rules: {
    "prettier/prettier": "error",
  },
  extends: ["eslint:recommended", "plugin:prettier/recommended"],
};
