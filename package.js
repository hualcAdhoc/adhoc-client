Package.describe({
  name: 'hualc:adhoc-client',
  version: '0.8.0',
  summary: 'Adhoc api for A/B testing',
  git: '',
  documentation: 'README.md'
});

Package.onUse(function(api) {
  api.versionsFrom('1.1.0.2');
  api.addFiles('adhoc-client.js', 'client');
});