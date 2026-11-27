// Тестовая сборка (APP_VARIANT=test): отдельное приложение «Arev ТЕСТ» (другой пакет, ставится рядом с рабочим),
// смотрит на тестовую базу. Рабочая сборка не меняется.
module.exports = ({ config }) => {
  if (process.env.APP_VARIANT !== 'test') return config;
  const android = Object.assign({}, config.android, { package: 'am.arevservice.master.test' });
  delete android.googleServicesFile; // push-уведомления в тестовой сборке выключены, пока в Firebase не добавлен пакет .test
  return Object.assign({}, config, {
    name: 'Arev ТЕСТ',
    slug: 'arev-test',
    owner: 'testarevs-team',
    android,
    extra: Object.assign({}, config.extra, { testBuild: true, eas: { projectId: '59de04cb-b4d4-4246-8beb-5a5171ffe8c1' } }),
  });
};
