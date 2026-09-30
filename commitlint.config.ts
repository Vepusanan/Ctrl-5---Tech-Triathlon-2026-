export default {
  extends: ['@commitlint/config-conventional'],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'refactor', 'test', 'docs', 'chore', 'perf', 'build', 'ci'],
    ],
    'scope-enum': [2, 'always', ['web', 'api', 'planning', 'shared', 'database', 'infra', 'docs']],
  },
};
