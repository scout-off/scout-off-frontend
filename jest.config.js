const nextJest = require("next/jest");

const createJestConfig = nextJest({
  dir: "./",
});

const customJestConfig = {
  testEnvironment: "jsdom",
  testMatch: ["**/__tests__/**/*.test.ts"],
};

module.exports = createJestConfig(customJestConfig);
